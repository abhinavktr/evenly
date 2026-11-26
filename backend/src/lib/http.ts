import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { authenticate, type AuthUser } from './auth.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Ctx {
  req: HttpRequest;
  ctx: InvocationContext;
  user: AuthUser;
  body: () => Promise<any>;
}

type Handler = (c: Ctx) => Promise<unknown>;

/** Wraps a handler with auth, JSON parsing and uniform error responses. */
export function route(handler: Handler, successStatus = 200) {
  return async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const user = await authenticate(req);
      const body = async () => {
        try {
          return await req.json();
        } catch {
          throw new HttpError(400, 'invalid JSON body');
        }
      };
      const result = await handler({ req, ctx, user, body });
      if (result === undefined) return { status: 204 };
      return { status: successStatus, jsonBody: result };
    } catch (err) {
      if (err instanceof HttpError) return { status: err.status, jsonBody: { error: err.message } };
      ctx.error('Unhandled error', err);
      return { status: 500, jsonBody: { error: 'internal error' } };
    }
  };
}
