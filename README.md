# Ick

The anti-dating app: you can only post your flaws, and people swipe on what they can handle. "What can you handle?"

| Part | Tech | Folder |
| --- | --- | --- |
| API | ASP.NET Core 8 minimal API, EF Core (SQLite locally, Postgres on Supabase when hosted) | `src/Sin.Api` |
| Shared contracts | DTOs, enums, limits | `src/Sin.Shared` |
| Mobile app (iOS + Android) | Expo SDK 58, React Native, expo-router | `app` |
| API tests | xUnit, in-process integration tests | `tests/Sin.Api.Tests` |

## Run it locally

Needs Docker Desktop and Node.

```
docker compose up -d --build      # API on http://localhost:5080
cd app
npm install
npx expo start                    # then press a for Android, or scan the QR code with Expo Go
```

With no `.env` file the API uses a local SQLite file and seeds demo users (password `password123`). To use Supabase instead, copy `.env.example` to `.env` and fill it in.

The app finds the API on your PC automatically in development. To point it somewhere else, set `EXPO_PUBLIC_API_URL` in `app/.env.local`.

## Tests

```
./run-api-tests.sh                # API suite, runs in a .NET SDK container
cd app && npx tsc --noEmit && npx jest
```

GitHub Actions runs both on every push (`.github/workflows/ci.yml`). Render deploys the API only after CI passes.

## How it works

- **Auth:** email and password (BCrypt, JWT bearer tokens stored in the device keychain), login throttling and lockout. Google and Apple sign-in exist in the API but stay off until their credentials are configured.
- **No bragging:** `NegativityGuard` bounces humblebrags; `ContentFilter` blocks abusive text (word list in `moderation-terms.txt`).
- **Feed:** people you haven't swiped on, matched by gender preference, with at least one confession, excluding blocked and banned accounts.
- **Matches and chat:** a match needs both people to swipe "I can handle that". Chat polls every few seconds.
- **Safety:** block, report, delete account, admin moderation endpoints (`X-Admin-Key`).
- **US only, with filters:** the app shares a location rounded to about a mile (`PUT /api/me/location`); the API only accepts points inside the United States, and people without one cannot browse, be shown or be swiped on. `Location:BypassEmails` exempts the store reviewers’ test login. Discover can be filtered by age, distance, height and race / ethnicity (`/api/me/preferences`).
- **No migrations:** new nullable columns in the model are added to an existing database at startup (`SchemaUpgrade`).
- **Moderation:** a word filter blocks slurs and threats in all text. With `Moderation:ApiKey` set (an Anthropic API key), photos, display names, headlines and confessions are also screened by Claude for pornography and gore before they are published. A blocked photo is never stored; if the screen is unreachable, photo uploads are refused and text falls back to the word filter. Chat messages are not sent to the AI.
- **Photos:** re-encoded to JPEG on upload with location and other metadata removed; stored in Supabase Storage when configured, otherwise on local disk.
- **Database:** on Postgres the tables live in a private `app` schema, so Supabase's public Data API cannot reach them.

## Deploying

- API hosting and secrets: `render.yaml`.
- App Store and Google Play: [STORE-LAUNCH.md](STORE-LAUNCH.md).
- Security review and status of each finding: [SECURITY-AUDIT.md](SECURITY-AUDIT.md).
