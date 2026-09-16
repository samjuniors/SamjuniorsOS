import crypto from 'crypto';
import { AuthenticatedFounder } from '../auth/session';

export interface LiveWsTicket {
  ticket: string;
  founder: AuthenticatedFounder;
  conversationId?: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * In-memory single-use ticket store for authenticating WebSocket connections
 * across ports or origins where direct cookie exchange may be restricted.
 */
export class LiveTicketStore {
  private static instance: LiveTicketStore;
  private tickets: Map<string, LiveWsTicket> = new Map();
  private readonly ttlMs: number = 60_000; // 60 seconds

  private constructor() {
    // Periodic sweeper for expired tickets every 30s
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

  /**
   * Issues a new single-use ticket for the verified Founder.
   */
  public issueTicket(founder: AuthenticatedFounder, conversationId?: string): string {
    const ticket = `ws_live_${crypto.randomBytes(24).toString('hex')}`;
    const now = Date.now();
    this.tickets.set(ticket, {
      ticket,
      founder,
      conversationId,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    });
    return ticket;
  }

  /**
   * Consumes and invalidates a ticket. Returns the bound founder and conversation if valid.
   */
  public consumeTicket(ticket: string): { founder: AuthenticatedFounder; conversationId?: string } | null {
    if (!ticket || !this.tickets.has(ticket)) {
      return null;
    }
    const entry = this.tickets.get(ticket)!;
    this.tickets.delete(ticket);

    if (Date.now() > entry.expiresAt) {
      return null;
    }

    return {
      founder: entry.founder,
      conversationId: entry.conversationId,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.tickets.entries()) {
      if (now > entry.expiresAt) {
        this.tickets.delete(key);
      }
    }
  }

  public clear(): void {
    this.tickets.clear();
  }
}
