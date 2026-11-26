// Expo only inlines EXPO_PUBLIC_* values when they are read as `process.env.EXPO_PUBLIC_X`
// literally — don't alias process.env or destructure it.
export const config = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:7071/api').replace(/\/$/, ''),
  tenantId: process.env.EXPO_PUBLIC_ENTRA_TENANT_ID ?? '',
  subdomain: process.env.EXPO_PUBLIC_ENTRA_SUBDOMAIN ?? '',
  clientId: process.env.EXPO_PUBLIC_ENTRA_CLIENT_ID ?? '',
  authMode: (process.env.EXPO_PUBLIC_AUTH_MODE ?? 'entra') as 'entra' | 'dev',
};

export const entra = {
  // Microsoft Entra External ID (CIAM) authority
  issuer: `https://${config.subdomain}.ciamlogin.com/${config.tenantId}/v2.0`,
  scopes: ['openid', 'profile', 'email', 'offline_access', `api://${config.clientId}/access_as_user`],
};
