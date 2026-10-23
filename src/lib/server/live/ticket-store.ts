import crypto from 'crypto';
import type { AuthenticatedFounder } from '../auth/session';

export interface LiveWsTicket {
  ticket: string;
  founder: AuthenticatedFounder;
  conversationId?: string;
  createdAt: number;
  expiresAt: number;
}

interface SignedTicketPayload {
  version: 2;
  founder: AuthenticatedFounder;
  conversationId?: string;
  expiresAt: number;
  nonce: string;
}

/**
 * With LIVE_WS_TICKET_SECRET, the Next.js route and standalone WS process
 * validate a short-lived authenticated, encrypted ticket without shared memory.
 * The WS process additionally enforces one-time consumption of each ticket.
 * Legacy in-memory tickets remain for same-process / existing test setups.
 */
export class LiveTicketStore {
  private static instance: LiveTicketStore;
  private tickets: Map<string, LiveWsTicket> = new Map();
  private consumedSignedTickets = new Map<string, number>();
  private readonly ttlMs: number = 60_000;

  private constructor() {
    if (typeof setInterval !== 'undefined') {
      const timer = setInterval(() => this.cleanup(), 30_000);
      if (timer.unref) timer.unref();
    }
  }

  public static getInstance(): LiveTicketStore {
    if (!LiveTicketStore.instance) {
      LiveTicketStore.instance = new LiveTicketStore();
    }
    return LiveTicketStore.instance;
  }

  private ticketSecret(): string | null {
    const secret = process.env.LIVE_WS_TICKET_SECRET?.trim();
    if (!secret) return null;
    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error('LIVE_WS_TICKET_SECRET must contain at least 32 UTF-8 bytes');
    }
    return secret;
  }

  public issueTicket(founder: AuthenticatedFounder, conversationId?: string): string {
    const now = Date.now();
    const secret = this.ticketSecret();
    if (secret) {
      const payload: SignedTicketPayload = {
        version: 2,
        founder,
        conversationId,
        expiresAt: now + this.ttlMs,
        nonce: crypto.randomBytes(16).toString('hex'),
      };
      // AES-GCM keeps founder identity private even if the URL is logged.
      const key = crypto.createHash('sha256').update(secret).digest();
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
      return `ws_live_v2.${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
    }

    const ticket = `ws_live_${crypto.randomBytes(24).toString('hex')}`;
    this.tickets.set(ticket, {
      ticket,
      founder,
      conversationId,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    });
    return ticket;
  }

  public consumeTicket(ticket: string): { founder: AuthenticatedFounder; conversationId?: string } | null {
    if (!ticket || ticket.length > 4096) return null;
    if (ticket.startsWith('ws_live_v2.')) {
      const secret = this.ticketSecret();
      if (!secret) return null;
      const match = /^ws_live_v2\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(ticket);
      if (!match || this.consumedSignedTickets.has(ticket)) return null;
      try {
        const iv = Buffer.from(match[1], 'base64url');
        const encrypted = Buffer.from(match[2], 'base64url');
        const tag = Buffer.from(match[3], 'base64url');
        if (iv.length !== 12 || tag.length !== 16) return null;
        const key = crypto.createHash('sha256').update(secret).digest();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
        const payload = JSON.parse(plaintext) as SignedTicketPayload;
        const now = Date.now();
        if (payload.version !== 2 || !Number.isFinite(payload.expiresAt) ||
            now > payload.expiresAt || payload.expiresAt > now + this.ttlMs ||
            !payload.nonce || !payload.founder ||
            typeof payload.founder.userId !== 'string' || !payload.founder.userId ||
            payload.founder.role !== 'FOUNDER' || payload.founder.isVerified !== true ||
            (payload.conversationId !== undefined && typeof payload.conversationId !== 'string')) return null;
        this.consumedSignedTickets.set(ticket, payload.expiresAt);
        return { founder: payload.founder, conversationId: payload.conversationId };
      } catch {
        return null;
      }
    }

    const entry = this.tickets.get(ticket);
    if (!entry) return null;
    this.tickets.delete(ticket);
    if (Date.now() > entry.expiresAt) return null;
    return { founder: entry.founder, conversationId: entry.conversationId };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.tickets.entries()) {
      if (now > entry.expiresAt) this.tickets.delete(key);
    }
    for (const [key, expiry] of this.consumedSignedTickets.entries()) {
      if (now > expiry) this.consumedSignedTickets.delete(key);
    }
  }

  public clear(): void {
    this.tickets.clear();
    this.consumedSignedTickets.clear();
  }
}
