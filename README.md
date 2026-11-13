# Sin — the anti-Tinder

Swipe on people based **only on their flaws**. No flexing, no best angles, no "I love to travel."
Profiles are a list of confessions (bad habits, baggage, money problems, temper, quirks, dealbreakers),
an optional *least flattering* photo, and a one-line headline about the worst thing about you.
Swipe **"I can live with that"** or **"Dealbreaker"**. Mutual "live with it" = match = chat.

A server-side **negativity guard** rejects humblebrags ("I'm a perfectionist", "I care too much", "6 ft"...).

## Stack

| Piece | Tech |
|---|---|
| Mobile (iOS + Android) | .NET MAUI 8, MVVM (CommunityToolkit.Mvvm) |
| API | ASP.NET Core 8 Minimal API, JWT auth, Swagger |
| Database | EF Core 8 + **SQLite** (a single `sin.db` file, created and seeded automatically) |
| Shared contracts | `Sin.Shared` class library used by both API and app |

```
src/
  Sin.Shared/   DTOs, enums, limits (shared by API + app)
  Sin.Api/      Minimal API: auth, profile/flaws, feed, swipes, matches, chat
  Sin.Mobile/   MAUI app: Login, Register, Feed (swipe cards), Matches, Chat, My Sins
```

## 1. Run the API (no database setup needed)

**Option A: Docker (recommended).** From the repo root:

```powershell
docker compose up --build -d
```

Data (SQLite DB + photos) lives in Docker volumes, so it survives restarts.
Reset everything with `docker compose down -v`.

**Option B: directly with .NET.**

```powershell
cd src/Sin.Api
dotnet run
```

> If Windows says *"An Application Control policy has blocked this file"*, that's Smart App Control
> blocking the freshly built, unsigned DLL. Use Docker (Option A) instead.

- Swagger UI: http://localhost:5080/swagger
- First run creates `sin.db` and seeds 8 demo users (password `password123`, e.g. `dana@demo.sin`).
- In Development, demo users **always like you back** so you can test matches and chat alone
  (`Demo:SeedUsersAlwaysLikeBack` in `appsettings.Development.json`).
- Reset everything: stop the API and delete `src/Sin.Api/sin.db`.

## 2. Run the app

One-time setup:

```powershell
dotnet workload install maui-android maui-ios   # run from an elevated (admin) terminal
```

**Android (works on Windows):** the Android SDK is already at `%LOCALAPPDATA%\Android\Sdk` on this machine
(installed with `dotnet build -t:InstallAndroidDependencies -f net8.0-android -p:AcceptAndroidSDKLicenses=True`).
For an emulator, install Android Studio → Device Manager → create a Pixel device. Or plug in a phone with
USB debugging on. Then:

```powershell
cd src/Sin.Mobile
dotnet build -t:Run -f net8.0-android
```

**iOS:** Apple requires a Mac with Xcode to build. Either build on a Mac
(`dotnet build -t:Run -f net8.0-ios`) or pair Visual Studio on Windows with a Mac on your network.

### Pointing the app at the API

`src/Sin.Mobile/AppConfig.cs` uses `http://localhost:5080/` everywhere:
- **Android emulator or USB phone:** run `adb reverse tcp:5080 tcp:5080` once after it connects.
- **iOS simulator:** works as-is.
- **Phone over Wi-Fi / production:** set `Override` to your server's address (https in production).

## SSO: Sign in with Google / Apple

How it works (the standard MAUI `WebAuthenticator` pattern, the same on iOS and Android):

1. App opens the system browser at `GET /api/auth/sso/{Google|Apple}`.
2. The API sends you to Google/Apple; they redirect back to `/signin-google` or `/signin-apple`.
3. The API finds or creates the user (linking by verified email to any existing account), issues
   the usual Sin JWT, and redirects to `sin://auth#token=...`, which the OS hands back to the app.
4. New SSO users land on **My Sins** to add age/preferences and a first confession. They're hidden
   from the feed until they do.

Buttons only appear for providers the server has credentials for (`GET /api/auth/providers`).

**Setup:** copy `.env.example` to `.env`, fill in the values (instructions are in the file), then
`docker compose up -d --build`.

- **Google** works locally: add `http://localhost:5080/signin-google` as an authorized redirect URI.
  The app talks to `localhost` on Android too, so run `adb reverse tcp:5080 tcp:5080` after the
  emulator/phone connects.
- **Apple** requires https on a real domain, so test it after you deploy (or through a tunnel like
  `ngrok http 5080` / VS Dev Tunnels, using that URL as the return URL and in `AppConfig.Override`).
- App Store rule: if an iOS app offers Google sign-in it must also offer Sign in with Apple.

## API overview

| Method | Route | What |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | Returns a JWT |
| GET | `/api/auth/providers`, `/api/auth/sso/{provider}` | SSO (see above) |
| GET/PUT | `/api/me` | My profile |
| POST | `/api/me/photo` | Upload least flattering photo (multipart `file`) |
| POST/DELETE | `/api/me/flaws`, `/api/me/flaws/{id}` | Confess / retract |
| GET | `/api/feed` | Unswiped profiles matching mutual gender preferences |
| POST | `/api/swipes` | `{ targetUserId, canLiveWithIt }` → `{ isMatch, matchId }` |
| GET | `/api/matches` | My matches + last message |
| GET/POST | `/api/matches/{id}/messages?after={lastId}` | Chat (app polls every 3s) |
| DELETE | `/api/matches/{id}` | Unmatch |

## Moving to a "real" database later

SQLite is fine for development and small deployments. For production:

1. `dotnet add src/Sin.Api package Npgsql.EntityFrameworkCore.PostgreSQL --version 8.*`
2. In `Program.cs` change `UseSqlite(...)` → `UseNpgsql(...)` and update the connection string.
3. Replace `EnsureCreated()` with EF migrations (`dotnet tool install -g dotnet-ef`, then
   `dotnet ef migrations add Initial`) so schema changes don't require wiping data.

## Before going to production

- Change `Jwt:Key` (use an environment variable / secret store, not appsettings).
- Serve the API over HTTPS and remove `usesCleartextTraffic` (Android) and `NSAllowsArbitraryLoads` (iOS).
- Move photo storage from `wwwroot/uploads` to blob storage (Azure Blob / S3).
- Add report/block, rate limiting, and real moderation (the negativity guard is a keyword list).
- Swap chat polling for SignalR, and add push notifications for matches/messages.
- App Store / Play Store dating apps need a privacy policy, age gate, and reporting tools.
