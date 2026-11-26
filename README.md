# Splitzy (formerly Evenly) — free expense-splitting app

An expense-splitting mobile app (Splitwise-style) built with **React Native + Expo** on top of a serverless **Azure** backend.

```
mobile/    Expo app (TypeScript, expo-router)          → iOS + Android
backend/   Azure Functions v4 API (Node 22, TypeScript) → Cosmos DB
infra/     Bicep template for all Azure resources
```

## Features (v1)

- Sign-in / sign-up through **Microsoft Entra External ID** (auth code + PKCE, tokens kept in the device keychain)
- **Friends**: add by email. People without an account are *invited*, and they see everything shared with them as soon as they sign up with that email
- **Groups** with a currency, members (add/remove), and a running balance for each member
- **Expenses**: split equally, by exact amounts, by percentages or by shares. Edit, delete (soft delete, so it stays in the activity feed)
- **Balances**: what you owe and are owed overall, per friend and per group, kept separate per currency
- **Simplify debts**: each group shows the smallest set of payments that clears everyone
- **Settle up**: record cash or bank payments, from a friend page or a group
- **Activity feed** of recent expenses, payments and deletions
- Light and dark mode

Money is stored as integer minor units (fils/cents, with 3-decimal currencies such as KWD/BHD/OMR handled), so rounding never creates or loses money.

---

## 1. Set up Microsoft Entra External ID

1. In the [Entra admin center](https://entra.microsoft.com), create an **external tenant** (Overview → Manage tenants → Create → External). Note the **Tenant ID** and the **subdomain** (`<subdomain>.ciamlogin.com`).
2. In that tenant, go to **App registrations → New registration**:
   - Name `Evenly`, *Accounts in this organizational directory only*.
   - Redirect URI: platform **Public client/native (mobile & desktop)**, value `evenly://auth`.
   - After it's created, also add `exp://<your-computer-LAN-IP>:8081/--/auth` (needed when testing in Expo Go).
3. **Expose an API**: set the Application ID URI to `api://<client-id>` and add a scope `access_as_user` (Admins and users can consent).
4. **API permissions**: Add → *My APIs* → Evenly → `access_as_user`. Make sure Microsoft Graph `openid`, `offline_access`, `email`, `profile` are present. Then **Grant admin consent**.
5. **Token configuration**: Add optional claim → token type **Access** → `email`.
6. **Manifest**: set `"requestedAccessTokenVersion": 2` (shown as `accessTokenAcceptedVersion` in older views).
7. **User flows → New user flow**: sign up and sign in, with *Email with password* (or one-time passcode). Collect **Display Name**. Open the flow → **Applications → Add application** → Evenly.
   *(Optional: add Google or Apple under External Identities → All identity providers, then enable them in the flow.)*

## 2. Deploy the Azure resources

Requires [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli).

```bash
az login
az functionapp list-flexconsumption-locations -o table   # pick a region from this list
az group create -n evenly-rg -l <region>
az bicep build -f infra/main.bicep                 # validates the template
az deployment group create -g evenly-rg -f infra/main.bicep \
  -p entraTenantId=<tenant-guid> entraTenantSubdomain=<subdomain> entraApiClientId=<client-id>
```

The outputs give you `functionAppName` and `apiUrl`. This creates:

| Resource | Notes |
|---|---|
| Cosmos DB (NoSQL, **serverless**) | database `evenly`, containers `users`, `groups`, `expenses` |
| Function App (**Flex Consumption**, Node 22) | system-assigned managed identity, no keys in settings |
| Storage account | runtime and deployment packages (no shared-key access) |
| App Insights + Log Analytics | logs and request tracing |

The API reaches Cosmos and Storage with its **managed identity** (RBAC roles are assigned in the template), so there are no secrets in app settings. Serverless Cosmos and Flex Consumption are both pay-per-use, so idle cost is close to zero.

> If sign-in works but the API returns `invalid or expired token`, paste an access token into jwt.ms and set the app setting `ENTRA_ISSUER` to its exact `iss` value.

## 3. Deploy the API

Requires [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local).

```bash
cd backend
npm ci
npm test                     # unit + end-to-end tests (in-memory DB)
func azure functionapp publish <functionAppName>
```

Smoke test: `curl https://<app>.azurewebsites.net/api/me` should return `401 missing bearer token`.

## 4. Run the mobile app

```bash
cd mobile
cp .env.example .env         # fill in API URL + Entra values
npm install
npx expo start
```

Scan the QR code with **Expo Go** (iOS/Android). For store builds use EAS: `npx eas build -p ios|android` (update `bundleIdentifier`/`package` in `app.json` first). Store builds use the `evenly://auth` redirect.

---

## Local development without Entra

1. Copy `backend/local.settings.sample.json` → `local.settings.json` and set `AUTH_MODE` to `dev`. Point `COSMOS_ENDPOINT`/`COSMOS_KEY` at your Cosmos account (or the Cosmos emulator), and create the database and containers if you're using the emulator.
2. Run `npm start` in `backend/`.
3. In `mobile/.env`, set `EXPO_PUBLIC_AUTH_MODE=dev` and `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:7071/api`.
4. The sign-in screen now just asks for an email, so you can sign in as several people to test splitting.

Dev mode trusts an `x-dev-user` header, and the API **refuses to start in dev mode inside Azure**.

## API

All routes are under `/api` and need `Authorization: Bearer <access token>`. Amounts are integer minor units.

| Method | Route | Purpose |
|---|---|---|
| GET / PATCH | `/me` | sign-in / register (claims an invite), update name or default currency |
| GET / POST | `/friends` | list with balances / add by email |
| GET | `/friends/{email}` | balance + shared expenses |
| GET / POST | `/groups` | list with my balance / create |
| GET / PATCH | `/groups/{id}` | detail (members, balances, simplified debts, expenses) / rename |
| POST / DELETE | `/groups/{id}/members[/{email}]` | add / remove (only once settled) |
| POST | `/expenses` | `{ groupId?, description, amount, currency, date, splitType, paidBy[], shares[] }` |
| GET / PUT / DELETE | `/expenses/{id}` | view / edit / soft-delete |
| POST | `/settlements` | `{ from, to, amount, currency, groupId? }` |
| GET | `/balances` | totals owed / owing |
| GET | `/activity` | recent feed |

The server re-checks that paid and owed amounts add up to the total, and that everyone on an expense is in the group (or is a friend, for non-group expenses).

## Notes and next steps

- Users are keyed by email (lower-cased), which is what makes invite-before-signup work. The Entra `oid` is stored on first sign-in.
- Containers are partitioned on `/id`, and list queries fan out across partitions. That's fine for thousands of users; at large scale, add a per-user membership index.
- Not in v1: receipt photos (Blob Storage), push notifications (Notification Hubs), currency conversion, recurring expenses, comments, CSV export.
