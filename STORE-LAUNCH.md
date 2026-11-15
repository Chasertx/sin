# Launching Ick on the App Store and Google Play

Everything in the code that the stores require is done. What's left needs your accounts, your payment, or a decision from you. Work through the steps in order.

## What's already in place

| Store requirement | Where it is |
| --- | --- |
| 18+ only | Sign-up and profile edits reject ages under 18; sign-up states the 18+ rule |
| Terms accepted at sign-up, no tolerance for abuse | Sign-up screen links to the terms and privacy policy |
| Filter objectionable content | Word filter on names, headlines, confessions and messages; AI screen for porn and gore on photos and profile text (needs the key in Step 2) |
| Report a user, block a user | Flag button on Discover; "..." menu in chat |
| Delete account inside the app | Possibly Icks → Account → Delete account |
| Public privacy policy and terms | `/privacy.html` and `/terms.html` on the API |
| Photos don't leak location | Every upload is re-encoded with hidden data removed |
| United States only | The app asks for location; the API only accepts a position inside the US. Without one you can't browse, be shown to anyone, or be swiped on |
| Filters (age, distance, height, race / ethnicity) | Possibly Icks → Who you want to see. Height and ethnicity on a profile are optional |
| App icon, splash screen, permissions text | `app/app.json`, `app/assets/images` |
| Store build configuration | `app/eas.json` |
| Demo-login shortcut hidden | Only shows in development builds |

Sign-in is email and password only for version 1. Google sign-in stays off: turning it on would also require adding Sign in with Apple (an Apple rule).

## Step 1. Decisions and accounts (you)

1. **Support email address.** Done: the legal pages show the support inbox. Make sure someone reads it; reports and deletion requests arrive there.
2. **Apple Developer Program**, $99 per year: https://developer.apple.com/programs/enroll/
3. **Google Play Console**, $25 once: https://play.google.com/console/signup
   New personal accounts must run a closed test with 12 testers for 14 days before going public. Start this early.
4. **Expo account**, free: https://expo.dev/signup. It builds the apps in the cloud, so no Mac is needed.

## Step 2. Put the API online (you, about 20 minutes)

1. Create the production Supabase project, `get-what-ya-get-prod`, with a **public** storage bucket named `photos`.
2. In Render: New → Blueprint → pick the `sin` repo. It reads `render.yaml` and asks for three secrets: the session-pooler connection string, the Supabase URL, and the service key.
3. In the Render dashboard, open the service's Environment tab and add `Moderation__ApiKey` with an Anthropic API key (console.anthropic.com → API keys). Until it is set, photos and profile text are **not** screened for porn or gore; the API logs a warning at startup to say so.
4. In the same Environment tab, add `Location__BypassEmails` with the email of the account you will give to store reviewers (Step 6). Reviewers are often outside the US or have location switched off; without this they can't get past Discover and the app is rejected. Leave everyone else off this list.
5. Open `https://<your-service>.onrender.com/health`. It should say `{"status":"ok"}`.
6. If the address is not `https://get-what-ya-get-api-3dtp.onrender.com`, change `EXPO_PUBLIC_API_URL` in `app/eas.json` (two places).

Render's free plan puts the API to sleep after 15 minutes idle, and waking takes up to a minute. A store reviewer who hits that sees an app that won't load. Use the $7 per month plan (or your Azure hosting) before submitting for review.

## Step 3. Build the apps

Run these in the `app` folder:

```
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform android --profile preview
```

The preview build gives you an APK link to install on a real Android phone. Test it against the live API. Then build for the stores:

```
npx eas-cli@latest build --platform all --profile production
```

EAS asks to create the signing keys for you. Say yes to both.

## Step 4. Create the store listings

**Name:** Ick

**Subtitle (Apple, 30 characters):** Dating that leads with flaws

**Short description (Google, 80 characters):** The dating app where you post your flaws first. What can you handle?

**Full description:**

> Every dating profile is a highlight reel. This one is the blooper reel.
>
> On Ick, you can't brag. You confess: the snoring, the seven streaming subscriptions, the grudge against a restaurant from 2019. Then you swipe on other people's confessions and decide what you can live with.
>
> • Confess your real flaws. Humblebrags like "I'm a perfectionist" get bounced.
> • Swipe "I can handle that" or "Too much."
> • Match when you both say you can handle each other.
> • Chat with people who already know the worst.
>
> Find out what gives you the ick before the third date, not three months in.
>
> Ick is for adults 18 and over. Be honest about yourself, never cruel about anyone else: harassment and hate get accounts removed.

**Category:** Lifestyle (Apple: Lifestyle, secondary Social Networking). Google: Dating.

**Keywords (Apple):** dating,flaws,honest,red flags,match,singles,chat,swipe,funny,confessions

**Age rating:** Apple 17+ or 18+ (answer "yes" to user-generated content and dating). Google: complete the questionnaire as a dating app with user-generated content; expect Mature 17+.

**Countries:** United States only. Google Play: Production → Countries / regions. App Store Connect: Pricing and Availability. The app also enforces this itself.

**Privacy policy URL:** `https://<your-service>.onrender.com/privacy.html`

**Account deletion URL (Google asks for this):** the same privacy page. It explains in-app deletion and deletion by email.

**Screenshots:** take them from the preview build on a phone, or from the emulator. Apple needs 6.9-inch iPhone screenshots; Google needs at least two phone screenshots, a 512×512 icon (`app/assets/images/icon.png` resized), and a 1024×500 feature graphic.

## Step 5. Privacy questionnaires

Both stores ask what data the app collects. These answers match what the app does.

| Data | Collected | Purpose | Linked to the user |
| --- | --- | --- | --- |
| Email address | Yes | Account, sign-in | Yes |
| Name (display name) | Yes | App functionality | Yes |
| Age, gender, who they're interested in | Yes | App functionality (matching) | Yes |
| Photos | Yes, optional | App functionality, safety screening | Yes |
| Messages, confessions, headline | Yes | App functionality | Yes |
| Reports and blocks | Yes | Safety | Yes |
| Approximate location (rounded to about a mile; never precise) | Yes | App functionality: US-only check, distance | Yes |
| Race and ethnicity | Yes, optional | App functionality: other people's filters. Not shown on the profile | Yes |
| Height (Google: "Other info" under Personal info; Apple: "Other user content") | Yes, optional | App functionality | Yes |
| Precise location, contacts, advertising ID, health, financial | No | | |

- Tracking and ads: none.
- Data sold or shared with third parties for their own use: none. Photos and profile text go to Anthropic only as a service provider, to screen them for prohibited content; say so if a form asks about processors.
- Encrypted in transit: yes.
- Users can request deletion: yes, in the app.
- Apple export compliance: uses only standard encryption (already declared in `app.json`).

## Step 6. Review notes and submission

Reviewers need a login. Create two accounts in the live app (so one can show the other in Discover, each with a confession), and give one to the reviewer. Put the reviewer account's email in `Location__BypassEmails` on Render (Step 2) so it works from outside the US:

> Sign in with: `<review account email>` / `<password>`.
> This is a dating app for adults with user-generated text and one optional photo.
> The app is only available in the United States and asks for location to check that. This review account is exempt, so it works from any country and with location denied.
> Safety features: a word filter on all text; automatic AI screening that refuses pornographic or gory photos and profile text before they are published; Report and Block from the flag button on the Discover screen and the "..." menu in chat; reports are reviewed within 24 hours and offending accounts are banned. Account deletion: Possibly Icks tab → Account → Delete account.

Then submit:

```
npx eas-cli@latest submit --platform ios
npx eas-cli@latest submit --platform android
```

For Android, the first upload goes to the closed test track for the 14-day tester requirement.

## After launch: handling reports

Reports must be acted on within 24 hours. Until there is a moderation screen, use the admin API with the `Admin__ApiKey` value from the Render dashboard, sent as the `X-Admin-Key` header: list reports, then ban the account or dismiss the report. The endpoints are in `src/Sin.Api/Endpoints/AdminEndpoints.cs`.

## Known gaps (not store blockers)

- No "forgot password" yet. It needs an email-sending service; until then a locked-out user has to email support.
- No push notifications; chat refreshes every few seconds while open.
- The database password shown during setup should be rotated in Supabase before real users sign up.
