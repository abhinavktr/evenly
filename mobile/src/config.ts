const env = process.env;

export const config = {
  apiUrl: (env.EXPO_PUBLIC_API_URL ?? 'http://localhost:7071/api').replace(/\/$/, ''),
  tenantId: env.EXPO_PUBLIC_ENTRA_TENANT_ID ?? '',
  subdomain: env.EXPO_PUBLIC_ENTRA_SUBDOMAIN ?? '',
  clientId: env.EXPO_PUBLIC_ENTRA_CLIENT_ID ?? '',
  authMode: (env.EXPO_PUBLIC_AUTH_MODE ?? 'entra') as 'entra' | 'dev',
};

export const entra = {
  // Microsoft Entra External ID (CIAM) authority
  issuer: `https://${config.subdomain}.ciamlogin.com/${config.tenantId}/v2.0`,
  scopes: ['openid', 'profile', 'email', 'offline_access', `api://${config.clientId}/access_as_user`],
};
