/**
 * Zero-dependency Web Standards HTTP compatibility layer for Express + Node.
 * Replaces NextRequest and NextResponse with Node.js native global Request and Response.
 */

export interface ResponseCookieOptions {
  path?: string;
  expires?: Date | number;
  maxAge?: number;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: boolean | 'lax' | 'strict' | 'none';
}

function serializeCookie(name: string, val: string, opt: ResponseCookieOptions = {}): string {
  const enc = encodeURIComponent;
  let str = `${name}=${enc(val)}`;
  if (opt.maxAge !== undefined) {
    str += `; Max-Age=${Math.floor(opt.maxAge)}`;
  }
  if (opt.domain) {
    str += `; Domain=${opt.domain}`;
  }
  if (opt.path) {
    str += `; Path=${opt.path}`;
  }
  if (opt.expires) {
    const exp = typeof opt.expires === 'number' ? new Date(opt.expires) : opt.expires;
    str += `; Expires=${exp.toUTCString()}`;
  }
  if (opt.httpOnly) {
    str += '; HttpOnly';
  }
  if (opt.secure) {
    str += '; Secure';
  }
  if (opt.sameSite) {
    const sameSite = typeof opt.sameSite === 'string' ? opt.sameSite.toLowerCase() : opt.sameSite;
    if (sameSite === true || sameSite === 'strict') {
      str += '; SameSite=Strict';
    } else if (sameSite === 'lax') {
      str += '; SameSite=Lax';
    } else if (sameSite === 'none') {
      str += '; SameSite=None';
    }
  }
  return str;
}

export class NextResponse extends Response {
  public cookies: {
    set: (name: string, value: string, options?: ResponseCookieOptions) => NextResponse;
    delete: (name: string) => NextResponse;
    get: (name: string) => { name: string; value: string } | undefined;
    getAll: () => Array<{ name: string; value: string }>;
  };

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    super(body, init);
    const self = this;
    this.cookies = {
      set(name: string, value: string, options?: ResponseCookieOptions) {
        self.headers.append('Set-Cookie', serializeCookie(name, value, options));
        return self;
      },
      delete(name: string) {
        self.headers.append('Set-Cookie', serializeCookie(name, '', { path: '/', maxAge: 0 }));
        return self;
      },
      get(name: string) {
        const setCookies = typeof (self.headers as any).getSetCookie === 'function'
          ? (self.headers as any).getSetCookie()
          : [];
        for (const sc of setCookies) {
          const parts = sc.split(';')[0].split('=');
          if (parts[0].trim() === name) {
            return { name, value: decodeURIComponent(parts.slice(1).join('=')) };
          }
        }
        return undefined;
      },
      getAll() {
        const setCookies = typeof (self.headers as any).getSetCookie === 'function'
          ? (self.headers as any).getSetCookie()
          : [];
        return setCookies.map((sc: string) => {
          const parts = sc.split(';')[0].split('=');
          return { name: parts[0].trim(), value: decodeURIComponent(parts.slice(1).join('=')) };
        });
      },
    };
  }

  static json(data: any, init?: ResponseInit): NextResponse {
    const body = JSON.stringify(data);
    const headers = new Headers(init?.headers);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    return new NextResponse(body, {
      ...init,
      headers,
    });
  }

  static redirect(url: string | URL, status: number = 307): NextResponse {
    return new NextResponse(null, {
      status,
      headers: {
        Location: typeof url === 'string' ? url : url.toString(),
      },
    });
  }

  static next(_init?: any): NextResponse {
    const res = new NextResponse(null, { status: 200 });
    res.headers.set('x-middleware-next', '1');
    return res;
  }
}

export interface NextRequestCookie {
  name: string;
  value: string;
}

export class NextRequest extends Request {
  public nextUrl: URL;
  public cookies: {
    get: (name: string) => NextRequestCookie | undefined;
    has: (name: string) => boolean;
    getAll: () => NextRequestCookie[];
    set?: (name: string, value: string) => void;
    delete?: (name: string) => void;
  };

  constructor(input: string | URL | Request, init?: RequestInit) {
    super(input, init);
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    this.nextUrl = new URL(urlStr);

    const parseCookies = () => {
      const cookieHeader = this.headers.get('cookie') || '';
      const map = new Map<string, string>();
      cookieHeader.split(';').forEach((c) => {
        const parts = c.trim().split('=');
        if (parts[0]) {
          map.set(parts[0], decodeURIComponent(parts.slice(1).join('=')));
        }
      });
      return map;
    };

    const cookieMap = parseCookies();

    this.cookies = {
      get: (name: string) => {
        const val = cookieMap.get(name);
        return val !== undefined ? { name, value: val } : undefined;
      },
      has: (name: string) => cookieMap.has(name),
      getAll: () => Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value })),
    };
  }
}
