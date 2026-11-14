# Security Audit: Get What Ya Get

**Date:** 2026-11-13 · **Scope:** .NET 8 API (`src/Sin.Api`), Expo app (`app/`), hosting config (Docker, Render, Supabase), dependencies, git history.
**Method:** manual code review of every endpoint and auth path, automated dependency scans (`dotnet list package --vulnerable`, `npm audit`), secret scan of the full git history, and the 269 automated tests (148 API + 121 app).

**Status:** not yet deployed. Nothing below is exploitable today because the API only runs locally, but items 1–5 must be fixed before going live.

## Summary

| # | Severity | Finding | Fix effort |
|---|---|---|---|
| 1 | 🔴 Critical | Supabase would expose every table (incl. password hashes and messages) to anyone holding the public key | Small |
| 2 | 🟠 High | SSO login token is delivered over a custom URL scheme another app can intercept | Medium |
| 3 | 🟠 High | SSO links accounts by email without checking the email is verified | Small |
| 4 | 🟠 High | Uploaded photos keep EXIF metadata, including GPS location | Medium |
| 5 | 🟠 High | Vulnerable native SQLite library (GHSA-2m69-gcr7-jv3q) | Small |
| 6 | 🟡 Medium | Login response time reveals whether an email is registered | Small |
| 7 | 🟡 Medium | No maximum password length (bcrypt silently ignores bytes after 72) | Small |
| 8 | 🟡 Medium | API container runs as root | Small |
| 9 | 🟡 Medium | Photo type is trusted from the client header, not the file contents | Small |
| 10 | 🟡 Medium | `AllowedHosts: *` and forwarded headers trusted from any source | Small |
| 11 | 🟡 Medium | Login throttled per IP only; no per-account protection | Small |
| 12 | 🟡 Medium | 30-day tokens, no refresh, no password change/reset, no "log out everywhere" | Large |
| 13 | 🟡 Medium | Admin actions (bans) aren't audit-logged | Small |
| 14 | 🟢 Low | Registration reveals that an email already has an account | Small |
| 15 | 🟢 Low | 21 moderate/low npm advisories in Expo build tooling (not shipped in the app) | Wait for Expo |
| 16 | 🟢 Low | Two simultaneous swipes on the same person return a 500 | Small |
| 17 | 🟢 Low | Missing `X-Content-Type-Options: nosniff` on locally served uploads | Small |
| 18 | 🟢 Low | Production `/` redirects to a privacy page that doesn't exist yet | Small |

## Findings

### 1. 🔴 Supabase Data API exposes all tables
Supabase automatically publishes every table in the `public` schema through its REST API (PostgREST). The API creates its tables there (`Users`, `Messages`, `Flaws`, …) with Row Level Security **off**. Anyone with the project's publishable key (`sb_publishable_…`, designed to be public, and it was shared in this project's setup) could read password hashes, emails and private messages, and write to them.
**Fix (either works; both is best):**
- Put the API's tables in a private schema (e.g. `app`) that the Data API doesn't expose: one line in `SinDb` (`modelBuilder.HasDefaultSchema("app")` for Postgres).
- Enable RLS on every table with no policies. The API connects as the table owner and is unaffected.
- Optionally turn off the Data API in Supabase settings, since this app doesn't use it.

### 2. 🟠 SSO token sent via custom URL scheme
After Google/Apple sign-in, the API redirects to `sin://auth#token=<30-day JWT>`. On Android any installed app can register the `sin` scheme and receive that URL, getting a full session. `sin` is also a short, collision-prone name.
**Fix:** redirect with a short-lived, single-use **code** instead of the token, and have the app exchange it (together with a PKCE verifier it generated) at `POST /api/auth/sso/exchange`. Also move to a distinctive scheme (`getwhatyaget://`) and, for release builds, verified Android App Links / iOS Universal Links.

### 3. 🟠 SSO links to existing accounts by unverified email
`SsoEndpoints` attaches a Google/Apple identity to any existing account with the same email. If a provider ever returns an unverified address, that's an account takeover of the password account.
**Fix:** only link when the provider asserts `email_verified=true` (map the claim for Google; Apple's emails are verified); otherwise create a separate account or require the password to link.

### 4. 🟠 Photo metadata leaks location
Phone photos usually carry EXIF data: GPS coordinates, device model, timestamp. Photos are stored and served byte-for-byte, so a match could download a photo and find where someone lives. That's a serious safety risk for a dating app.
**Fix:** re-encode every upload server-side (e.g. ImageSharp): strip all metadata, normalize orientation, cap dimensions (e.g. 1600px), and convert to JPEG/WebP. This also fixes #9.

**Status: fixed (2026-11-14).** `PhotoProcessor` re-encodes every upload with Magick.NET (Apache 2.0): only JPEG/PNG/WebP are decoded, rotation is applied, photos are capped at 1600px, all metadata is stripped, and the result is stored as JPEG. Files that don't decode are rejected. Covered by tests in `ProfileTests`.

### 5. 🟠 Vulnerable SQLite native library
`SQLitePCLRaw.lib.e_sqlite3 2.1.6` (pulled in by EF Core SQLite) has a High advisory. Production uses Postgres, but the library still ships in the server image.
**Fix:** reference `SQLitePCLRaw.bundle_e_sqlite3` at a patched version, or drop SQLite from the production build.

### 6. 🟡 Login timing reveals registered emails
For an unknown email, `/api/auth/login` returns immediately. For a known one it runs bcrypt (~100 ms). The responses are identical, but the timing isn't.
**Fix:** run bcrypt against a fixed dummy hash when the user isn't found.

### 7. 🟡 No maximum password length
bcrypt only uses the first 72 bytes, so two long passwords sharing a prefix are equivalent. Very large passwords also cost CPU.
**Fix:** reject passwords over 72 bytes (or pre-hash with SHA-256), and cap request body sizes on auth endpoints.

### 8. 🟡 Container runs as root
The Dockerfile has no `USER`. A compromise of the app process gets root inside the container.
**Fix:** add `USER $APP_UID` (the .NET 8 images ship a non-root `app` user).

### 9. 🟡 Upload type trusted from the client
Only the `Content-Type` header is checked. The file extension is derived from it, so this isn't an XSS vector today, but arbitrary bytes can be stored. **Fix:** covered by re-encoding in #4, or check magic bytes.

**Status: fixed (2026-11-14)** by the re-encoding in #4.

### 10. 🟡 Host and proxy trust
`AllowedHosts: "*"` lets any `Host` header through, and `ForwardedHeaders` trusts `X-Forwarded-*` from any source. Behind Render's proxy this is acceptable (the proxy sets the last hop), but if the API is ever exposed directly, a client could spoof its IP to dodge rate limits.
**Fix:** set `AllowedHosts` to the production domain; restrict `KnownProxies`/`KnownNetworks` when the host publishes its proxy ranges.

### 11. 🟡 Login throttling is per-IP only
10 attempts/minute per IP. A botnet or rotating proxies can still guess a single account's password. **Fix:** add a per-account limit with exponential backoff, and alert on spikes.

### 12. 🟡 Session lifecycle
Tokens last 30 days with no refresh token. Deleted and banned accounts are cut off immediately (checked on every request ✅), but there's no password change, password reset, "log out of all devices", or email verification.
**Fix:** short-lived access tokens (15–60 min) plus rotating refresh tokens stored server-side; add password reset via email, and a token version on the user to revoke all sessions.

### 13. 🟡 No admin audit trail
Ban, unban and report-status changes aren't recorded. **Fix:** log each admin action (who, what, when) to a table, and use per-moderator keys instead of one shared key.

### 14–18. 🟢 Low
- **14:** "That email is already registered" enables enumeration; standard UX trade-off, mitigated by the rate limit.
- **15:** `npm audit` reports moderate ReDoS issues in `minimatch` via `@expo/fingerprint` (build tooling). Not in the app bundle. Update when Expo ships a fix.
- **16:** Concurrent duplicate swipes hit the primary key and return 500 instead of 409. Catch `DbUpdateException`.
- **17:** Add `X-Content-Type-Options: nosniff` (and a basic security-header set) to API responses.
- **18:** Add the privacy policy and terms pages (also an App Store/Play requirement).

## What's already done right ✅
- Passwords hashed with **bcrypt**. No plaintext anywhere, and tests verify it.
- **JWT** signed with HS256; the server refuses to start in production with the placeholder key.
- Tokens are **revoked immediately** for deleted or banned accounts (DB check on each request; tested).
- **Authorization on every endpoint.** Users can only read and modify their own data; tests prove outsiders get 404 on others' chats, flaws and matches.
- **SSO return URLs are allow-listed.** Tokens can never be redirected to a website, and Expo Go URLs are allowed only in development (tested).
- **No SQL injection surface.** All queries go through EF Core parameterization.
- **Rate limiting** on auth (10/min) and globally (300/min per user).
- **Abuse controls:** content filter, block, report, moderator bans. The admin API is invisible (404) without the key and uses a constant-time comparison.
- **Account deletion** removes the profile, confessions, swipes, matches, messages, logins and photo (tested).
- **Secrets:** none in the repo or its history. `.env`, `app/.env.local` and `secrets/` are git-ignored.
- **App:** the session token is stored in the OS keychain (`expo-secure-store`); release builds block plain HTTP by default.
- **Swagger and CORS** are development-only. HSTS is on in production.

## Recommended order
1. Before any deployment: **#1, #3, #5, #6, #7, #8** (all small).
2. Before public launch: **#2, #4, #10, #11, #17, #18**.
3. Soon after launch: **#12, #13**, plus email verification and password reset.
