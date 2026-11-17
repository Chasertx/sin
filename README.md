# Ick

**The anti-dating app.** Profiles are made of flaws, not highlights. You post your confessions, other people swipe on what they can handle, and you only match when both of you can live with it.

> What can you handle?

Ick is a full-stack mobile app: an ASP.NET Core API, a React Native (Expo) client for iOS and Android, and a test suite covering both.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Testing](#testing)
- [API overview](#api-overview)
- [How it works](#how-it-works)
- [Deployment](#deployment)

---

## Features

- **Confession profiles.** Categorized flaws, red flags and dealbreakers instead of a bio. A guard rejects humblebrags ("I'm too nice", "I work too hard").
- **Swipe deck.** "I can handle that" or "Too much". A tap opens the full profile with every confession.
- **Mutual matches and chat.** A match needs both people to swipe right; chat lives on the match.
- **Match history.** A timeline of every match, when it started and how it ended, grouped by month.
- **Discover filters.** Age, distance, height and ethnicity, with range sliders.
- **Email verification.** New accounts confirm their address before they can sign in, with a rate-limited resend.
- **Safety.** Block, report, unmatch, delete account, plus admin endpoints for reviewing reports and banning accounts.
- **Content moderation.** A word filter for slurs and threats on all text, and an optional AI screen for nudity and gore on photos and profile text.
- **Privacy by default.** Locations are rounded to about a mile, photo metadata (including GPS) is stripped on upload, and ethnicity is used for filtering only, never shown.
- **Age gate.** Nothing in the app is reachable until the user confirms they are 18 or older.
- **Light and dark themes**, or follow the device setting.
- **Practice accounts.** Sign up with an address at the configured practice domain to get a private, pre-populated world of made-up people for demos and app store review.

## Tech stack

| Layer | Technology |
| --- | --- |
| API | ASP.NET Core 8 minimal APIs, Entity Framework Core |
| Database | SQLite locally, PostgreSQL in production (Supabase) |
| Auth | Email and password (BCrypt), JWT bearer tokens, optional Google and Apple sign-in |
| Photos | Magick.NET for re-encoding; Supabase Storage or local disk |
| Email | Resend |
| Mobile app | Expo SDK 58, React Native 0.88, React 19, Expo Router, TypeScript |
| Tests | xUnit integration and unit tests (API); Jest with React Native Testing Library (app) |
| CI/CD | GitHub Actions, Render (API), EAS Build (app) |

## Repository layout

```
.
├── src/
│   ├── Sin.Api/            ASP.NET Core API (endpoints, data, services)
│   └── Sin.Shared/         DTOs, enums and limits shared across the API
├── tests/
│   └── Sin.Api.Tests/      In-process integration tests and unit tests
├── app/                    Expo / React Native client
│   └── src/
│       ├── app/            Screens (file-based routing with Expo Router)
│       ├── components/     Reusable UI: swipe card, sheets, sliders, timeline
│       └── lib/            API client, session, theme, filters, location
├── docker-compose.yml      Runs the API locally
├── render.yaml             Render blueprint for the hosted API
└── STORE-LAUNCH.md         App Store and Google Play submission checklist
```

## Getting started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or the [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) to run the API directly)
- [Node.js](https://nodejs.org/) 22+
- An Android emulator, iOS simulator (macOS only), or a phone with [Expo Go](https://expo.dev/go)

### 1. Start the API

```bash
docker compose up -d --build
```

The API listens on `http://localhost:5080`, with Swagger UI at `http://localhost:5080/swagger` in the Development environment.

With no `.env` file it uses a local SQLite database and seeds demo users (password `password123`).

To run without Docker:

```bash
dotnet run --project src/Sin.Api
```

### 2. Start the app

```bash
cd app
npm install
npx expo start
```

Press `a` for Android, `i` for iOS, or scan the QR code with Expo Go. In development the app reaches the API on your machine automatically, using the same address your phone uses for the Expo dev server. To point it somewhere else, set `EXPO_PUBLIC_API_URL` in `app/.env.local`.

## Configuration

Copy `.env.example` to `.env` and fill in what you need. Every integration is optional, and leaving a value blank turns that feature off.

| Variable | Purpose |
| --- | --- |
| `JWT_KEY` | Secret used to sign login tokens. Required in production. |
| `DATABASE_PROVIDER`, `DATABASE_URL` | Switch from SQLite to PostgreSQL. Accepts a `postgresql://` URI or an Npgsql connection string. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Store photos in Supabase Storage instead of on local disk. |
| `ANTHROPIC_API_KEY` | Turns on AI screening of photos and profile text. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in. |
| `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID` | Sign in with Apple. The `.p8` key goes in `secrets/`. |

Other settings are read from `appsettings.json` and can be overridden with double-underscore environment variables, which is how the hosted API is configured:

| Setting | Purpose |
| --- | --- |
| `Resend__ApiKey`, `Resend__SenderDomain` | Sending verification emails. |
| `Moderation__ApiKey`, `Moderation__Model` | AI content screening (the same key as `ANTHROPIC_API_KEY` above). |
| `Admin__ApiKey` | Enables the admin endpoints (sent as `X-Admin-Key`). |
| `Practice__EmailDomain`, `Practice__MaxAccounts` | Domain that marks an address as a practice account, and how many may exist at once. |
| `Location__BypassEmails` | Comma-separated logins that skip the US location check, for store reviewers. |

## Testing

```bash
# API: runs the xUnit suite in a .NET SDK container
./run-api-tests.sh

# or directly, with the .NET SDK installed
dotnet test tests/Sin.Api.Tests

# App: typecheck, lint, and Jest
cd app
npm run typecheck
npm run lint
npm test
```

GitHub Actions runs both suites, plus a vulnerable-package check, on every push and pull request (`.github/workflows/ci.yml`).

## API overview

All routes are under `/api`. Everything except sign-up, login and verification requires a bearer token.

| Area | Routes |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/verify-email`, `POST /auth/resend-verification-email`, `GET /auth/providers`, `GET /auth/sso/{provider}` |
| Profile | `GET/PUT /me`, `PUT /me/location`, `GET/PUT /me/preferences`, `POST /me/photo`, `POST /me/flaws`, `DELETE /me/flaws/{id}`, `DELETE /me` |
| Discover | `GET /feed`, `POST /swipes` |
| Matches | `GET /matches`, `GET /matches/history`, `GET/POST /matches/{id}/messages`, `DELETE /matches/{id}` |
| Safety | `POST /users/{id}/block`, `POST /users/{id}/report` |
| Admin | `GET /admin/reports`, `POST /admin/reports/{id}/status/{status}`, `POST /admin/users/{id}/ban`, `POST /admin/users/{id}/unban` |

Full request and response schemas are in Swagger UI when the API runs in Development.

## How it works

**Feed.** Discover shows people you haven't swiped on whose gender preferences line up with yours in both directions, who pass your filters, and who have at least one confession. Blocked and banned accounts are excluded. Distance is computed in plain SQL arithmetic so the same query runs on SQLite and PostgreSQL.

**US only.** The app shares a location rounded to about a mile. The API accepts only points inside the United States and its territories, checking both the coordinates and the country the phone reports. Accounts without a US location can't browse, appear in feeds, or be swiped on.

**Auth hardening.** Failed logins return one generic message, and BCrypt runs even for unknown emails so response time doesn't reveal which addresses are registered. Accounts lock after repeated failures, on top of per-IP rate limiting. Tokens stop working the moment an account is banned or deleted.

**Photos.** Every upload is decoded and re-encoded as JPEG. That proves it is an image, applies the EXIF rotation, caps the dimensions and strips all metadata. A photo is stored only after it passes moderation, and uploads are refused if the moderation service is unreachable.

**Schema upgrades.** There are no EF migrations. On startup, `SchemaUpgrade` creates any tables and nullable columns the model has and the database lacks. It only adds, never drops or alters. On PostgreSQL all tables live in a private `app` schema, out of reach of Supabase's public Data API.

**Account deletion.** Deleting an account removes everything it created. The people it matched with keep a nameless "matched, then ended" entry in their history.

## Deployment

- **API:** Render, using `render.yaml` and `src/Sin.Api/Dockerfile`. Deploys run after CI passes on `main`.
- **App:** EAS Build. `npx eas-cli build --platform android --profile preview` produces an installable APK; the `production` profile produces store builds.
- **Store submission:** see [STORE-LAUNCH.md](STORE-LAUNCH.md).
