# Evenly — live deployment (26 Nov 2026)

None of these values are secrets; they're already in `mobile/.env`.

| Item | Value |
|---|---|
| Subscription | Visual Studio Premium with MSDN |
| Resource group | `evenly-rg` (group metadata in UAE North) |
| Backend region | **Central India**. Cosmos DB had no capacity for this subscription in UAE North or West Europe. |
| API base URL | https://evenly-api-hh7ohqo3kftvq.azurewebsites.net/api |
| Function App | `evenly-api-hh7ohqo3kftvq` (Flex Consumption, Node 22) |
| Cosmos DB | `evenly-cosmos-hh7ohqo3kftvq` (serverless, db `evenly`) |
| External tenant | `evenlyapp.onmicrosoft.com`, ID `e8eb454b-96be-4310-a5dd-e8c81deb624e` |
| App registration | `Evenly`, client ID `3c197f40-4b84-4a47-bb56-702117ba5619` |
| API scope | `api://3c197f40-4b84-4a47-bb56-702117ba5619/access_as_user` |
| User flow | `signup_signin`: email + password, collects display name, linked to Evenly |
| Redirect URI | `evenly://auth` (public client) |

## Still to do

1. **Expo Go redirect.** Run `npx expo start` and note the `exp://<ip>:8081` address it prints. In the portal, go to the *Evenly* app registration in the Evenly tenant, then Authentication, and add `exp://<ip>:8081/--/auth` as a Mobile/desktop redirect URI. It isn't needed for store/dev builds, which use `evenly://auth`.
2. **First sign-in.** Use **Sign in or create account** in the app. The first call to `/api/me` creates your profile.

## Redeploying the API

From `backend/`, create a `local.settings.json` containing
`{"IsEncrypted":false,"Values":{"FUNCTIONS_WORKER_RUNTIME":"node"}}`
(Core Tools needs it to detect the runtime), then:

```bash
npm ci && npm run build
func azure functionapp publish evenly-api-hh7ohqo3kftvq
```
