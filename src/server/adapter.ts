import type { Request as ExpressReq, Response as ExpressRes, NextFunction, Router } from 'express';
import type { NextRequest } from '../lib/server/http';

export interface RouteHandlerModule {
  GET?: (req: NextRequest) => Promise<Response | any>;
  POST?: (req: NextRequest) => Promise<Response | any>;
  PUT?: (req: NextRequest) => Promise<Response | any>;
  DELETE?: (req: NextRequest) => Promise<Response | any>;
  PATCH?: (req: NextRequest) => Promise<Response | any>;
}

export function toExpressHandler(handler: (req: NextRequest) => Promise<Response | any>) {
  return async (req: ExpressReq, res: ExpressRes, next: NextFunction): Promise<void> => {
    try {
      const host = req.get('host') || 'localhost:3000';
      const protocol = req.protocol || 'http';
      const url = `${protocol}://${host}${req.originalUrl}`;
      const urlObj = new URL(url);

      const headers = new Headers();
      for (const [key, val] of Object.entries(req.headers)) {
        if (val === undefined) continue;
        if (Array.isArray(val)) {
          for (const v of val) headers.append(key, v);
        } else {
          headers.set(key, val);
        }
      }

      const cookieHeader = req.headers.cookie || '';
      const cookiesMap = new Map<string, string>();
      if (cookieHeader) {
        cookieHeader.split(';').forEach((c) => {
          const idx = c.indexOf('=');
          if (idx > 0) {
            cookiesMap.set(c.substring(0, idx).trim(), decodeURIComponent(c.substring(idx + 1).trim()));
          }
        });
      }

      const cookies = {
        get: (name: string) => {
          const val = cookiesMap.get(name);
          return val !== undefined ? { name, value: val } : undefined;
        },
        has: (name: string) => cookiesMap.has(name),
        getAll: () => Array.from(cookiesMap.entries()).map(([name, value]) => ({ name, value })),
      };

      let rawBodyBuffer: Buffer | null = null;
      if (Buffer.isBuffer(req.body)) {
        rawBodyBuffer = req.body;
      } else if (typeof req.body === 'string') {
        rawBodyBuffer = Buffer.from(req.body);
      } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        rawBodyBuffer = Buffer.from(JSON.stringify(req.body));
      }

      const adaptedReq: any = {
        url,
        method: req.method,
        headers,
        nextUrl: urlObj,
        cookies,
        json: async () => {
          if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
            return req.body;
          }
          if (rawBodyBuffer) {
            return JSON.parse(rawBodyBuffer.toString('utf-8'));
          }
          return {};
        },
        text: async () => {
          if (rawBodyBuffer) return rawBodyBuffer.toString('utf-8');
          if (typeof req.body === 'string') return req.body;
          if (req.body) return JSON.stringify(req.body);
          return '';
        },
        arrayBuffer: async () => {
          if (rawBodyBuffer) {
            return rawBodyBuffer.buffer.slice(rawBodyBuffer.byteOffset, rawBodyBuffer.byteOffset + rawBodyBuffer.byteLength);
          }
          return new ArrayBuffer(0);
        },
        blob: async () => {
          if (rawBodyBuffer) {
            return new Blob([new Uint8Array(rawBodyBuffer)]);
          }
          return new Blob([]);
        },
      };

      const result = await handler(adaptedReq as NextRequest);

      if (!result) {
        res.status(204).end();
        return;
      }

      if (result instanceof Response || (result.status && result.headers)) {
        res.status(result.status || 200);
        if (result.headers && typeof result.headers.forEach === 'function') {
          result.headers.forEach((val: string, key: string) => {
            if (key.toLowerCase() !== 'content-length' && key.toLowerCase() !== 'set-cookie') {
              res.setHeader(key, val);
            }
          });
        }

        if (typeof (result.headers as any).getSetCookie === 'function') {
          const cookies = (result.headers as any).getSetCookie();
          if (cookies && cookies.length > 0) {
            res.setHeader('Set-Cookie', cookies);
          }
        }

        if (result.body) {
          if (typeof (result.body as any).getReader === 'function') {
            const reader = (result.body as ReadableStream<Uint8Array>).getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) res.write(Buffer.from(value));
              }
            } finally {
              res.end();
            }
            return;
          } else {
            const arrayBuf = await result.arrayBuffer();
            const buf = Buffer.from(arrayBuf);
            res.setHeader('content-length', buf.length);
            res.end(buf);
            return;
          }
        } else {
          res.end();
          return;
        }
      }

      res.json(result);
    } catch (err) {
      console.error(`[API Error] ${req.method} ${req.originalUrl}:`, err);
      next(err);
    }
  };
}

export function registerRoute(router: Router, routePath: string, routeModule: RouteHandlerModule) {
  if (routeModule.GET) {
    router.get(routePath, toExpressHandler(routeModule.GET));
  }
  if (routeModule.POST) {
    router.post(routePath, toExpressHandler(routeModule.POST));
  }
  if (routeModule.PUT) {
    router.put(routePath, toExpressHandler(routeModule.PUT));
  }
  if (routeModule.DELETE) {
    router.delete(routePath, toExpressHandler(routeModule.DELETE));
  }
  if (routeModule.PATCH) {
    router.patch(routePath, toExpressHandler(routeModule.PATCH));
  }
}
