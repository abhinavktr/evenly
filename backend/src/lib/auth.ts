import type { HttpRequest } from '@azure/functions';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { HttpError } from './http.js';

export interface AuthUser {
  id: string; // normalised email
  email: string;
  name: string;
  oid: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function entraConfig() {
  const tenantId = process.env.ENTRA_TENANT_ID;
  const subdomain = process.env.ENTRA_TENANT_SUBDOMAIN;
  const clientId = process.env.ENTRA_API_CLIENT_ID;
  if (!tenantId || !subdomain || !clientId) throw new Error('Entra settings are missing');
  // Microsoft Entra External ID (CIAM) endpoints
  const base = `https://${subdomain}.ciamlogin.com/${tenantId}`;
  return {
    // Override with ENTRA_ISSUER if your tokens' "iss" claim differs (check a token at jwt.ms).
    issuer: process.env.ENTRA_ISSUER || `https://${tenantId}.ciamlogin.com/${tenantId}/v2.0`,
    jwksUri: `${base}/discovery/v2.0/keys`,
    audiences: [clientId, `api://${clientId}`],
  };
}

function claimEmail(p: JWTPayload): string | undefined {
  const c = p as Record<string, unknown>;
  const candidates = [c.email, Array.isArray(c.emails) ? c.emails[0] : undefined, c.preferred_username, c.upn];
  return candidates.find((v): v is string => typeof v === 'string' && v.includes('@'))?.toLowerCase();
}

export async function authenticate(req: HttpRequest): Promise<AuthUser> {
  // Local-only shortcut for testing the API without a tenant. Refuses to run inside Azure.
  if (process.env.AUTH_MODE === 'dev') {
    if (process.env.WEBSITE_INSTANCE_ID) throw new Error('AUTH_MODE=dev is not allowed in Azure');
    const email = req.headers.get('x-dev-user')?.trim().toLowerCase();
    if (!email) throw new HttpError(401, 'x-dev-user header required in dev auth mode');
    return { id: email, email, name: req.headers.get('x-dev-name') ?? email.split('@')[0], oid: `dev-${email}` };
  }

  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) throw new HttpError(401, 'missing bearer token');

  const cfg = entraConfig();
  jwks ??= createRemoteJWKSet(new URL(cfg.jwksUri));
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer: cfg.issuer, audience: cfg.audiences }));
  } catch {
    throw new HttpError(401, 'invalid or expired token');
  }

  const email = claimEmail(payload);
  if (!email) throw new HttpError(401, 'token has no email claim — add the "email" optional claim to the access token');
  const name = typeof payload.name === 'string' && payload.name ? payload.name : email.split('@')[0];
  return { id: email, email, name, oid: String(payload.oid ?? payload.sub) };
}
