# 6mansdle

Guess the 6mans rank from a Rocket League clip. Daily challenge, endless practice, streaks, leaderboard, and a
reviewed clip-submission pipeline.

## Layout

```
apps/api        Express + TypeScript API (Postgres, S3, Discord OAuth sessions)
apps/web        Vite + React + TypeScript frontend
apps/bot        Discord bot (discord.js) — clip submission and daily reminders from Discord
packages/shared Ranks and API types shared by all three
```

## Running locally

1. Install: `npm install`
2. Database: `docker compose up -d` for a local Postgres, or point `DATABASE_URL` at RDS.
3. Copy `.env.example` to `apps/api/.env` and fill it in. `SESSION_SECRET` must be random. Discord and AWS
   values are optional for browsing, required for login and uploads.
4. `npm run dev` starts the API on 3001 and the web app on 5173 (the web dev server proxies `/api`).

Migrations in `apps/api/src/db/migrations` run automatically on API start, or with `npm run db:migrate`.

## How the game stays honest

- The server picks clips and hands the browser a clip id plus a short-lived playback URL. Object keys are
  `clips/<uuid>.<ext>`, so nothing in the URL reveals the rank.
- A guess is `{clipId, rank, mode}`. The server decides correctness, records it, and only then returns the
  answer and the community distribution.
- Daily challenges are one row per UTC day. Logged-in users can answer once; guests keep their result in
  localStorage only.
- Streaks update inside the same transaction as the guess insert.

## Uploads and review

Signed-in users request a presigned PUT for exactly one key, content type and size. After the browser uploads
straight to S3, it calls `complete`, the server confirms the object exists, and the clip enters the `pending`
queue. Admins (Discord ids in `ADMIN_DISCORD_IDS`) approve, correct the rank, reject, or delete on `/admin`.

The browser never holds AWS credentials. Remove the old Cognito identity pool's unauthenticated S3 write
policy once the old site is retired.

## Achievements

Badges live in `packages/shared/src/achievements.ts` — a plain data array (id, name, description, emoji,
tier), so adding one is a one-line addition there plus a trigger condition in
`apps/api/src/services/achievements.ts`'s `evaluateAchievements`. That function is pure: it takes a
snapshot of a user's state right after a guess (counts, streak, run, distinct ranks correct, hour of day,
etc.) and the set of ids they already hold, and returns what's newly earned. `guesses.ts` calls the DB-facing
wrapper (`awardGuessAchievements`) inside the same transaction as the guess insert and streak/run update, so
an achievement is never recorded for a guess that didn't actually commit. The `contributor` badge is the one
exception — it isn't guess-driven, so it's awarded directly from the clip-approval transaction in
`routes/admin.ts`.

The snapshot is built from data the app already tracks incrementally (`user_daily_stats.played/correct`,
`user_endless_stats.played/correct`) rather than scanning `guesses` on every request. The two exceptions —
whether a user has now correctly guessed every rank, and whether their previous daily was wrong (for the
`comeback` badge) — are single indexed lookups, and only run when the relevant achievement isn't already
earned.

Existing players who played before this feature shipped won't be missing badges they'd already earned:
run `npm run backfill:achievements -w apps/api` once after migrating. It re-derives each user's badges from
`user_daily_stats`/`user_endless_stats` best-ever streak/run plus a few aggregate queries over `guesses` and
`clips` (time-of-day, comeback, contributor), feeding the same `evaluateAchievements` used live. Backfilled
badges get `earned_at = now()` rather than the historical moment they were actually earned, since that
moment isn't reconstructable from the aggregate tables.

## Discord bot

`apps/bot` is a standalone Node/TypeScript process (discord.js) that lets players submit clips
and check the daily challenge from Discord, without ever visiting the site. It talks to the API
over a separate, unauthenticated-by-browser path: `apps/api/src/routes/bot.ts`, mounted at
`/api/bot` and gated by `requireBotToken` (constant-time comparison of `Authorization: Bearer
<BOT_API_TOKEN>`). That router shares its upload logic with the browser flow via
`apps/api/src/services/uploads.ts` — same presign/complete/list functions, just called with a
Discord user's id instead of a session's. Leaving `BOT_API_TOKEN` unset turns the whole
integration off (every `/api/bot/*` route answers 503), so a deploy is safe before the bot is
configured.

Commands: `/submit rank:<rank> clip:<attachment>` presigns, streams the attachment straight from
Discord's CDN to S3, and completes the upload, replying ephemerally. `/daily` posts the current
daily's number, date, and play count publicly. `/myuploads` lists the caller's own submissions
and their review status, ephemerally. A `DailyScheduler` (`apps/bot/src/lib/scheduler.ts`, a
plain `setInterval` poll — no cron dependency) posts "New 6mansdle daily #N is live: ..." into
`DAILY_CHANNEL_ID` once per UTC day, the first tick at or after 00:05 UTC.

### One-time setup

1. **Create the bot application**: [Discord Developer Portal](https://discord.com/developers/applications)
   → New Application. Under **Bot**, add a bot and copy its token (`DISCORD_BOT_TOKEN`); copy the
   **Application ID** from General Information (`DISCORD_CLIENT_ID`).
2. **Scopes and permissions**: build an invite URL with scopes `bot` and `applications.commands`,
   and bot permissions `Send Messages` + `Use Slash Commands` (view/send in the channel you'll use
   for the daily post is enough — no elevated permissions needed):
   ```
   https://discord.com/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&scope=bot+applications.commands&permissions=2048
   ```
   Open it, pick your server, and authorize.
3. **Env file**: on the host, create `/opt/6mansdle/app/bot.env` (owned by `sixmansdle`, mode 600 —
   same convention as `/opt/6mansdle/app/.env`) with:
   ```
   DISCORD_BOT_TOKEN=...
   DISCORD_CLIENT_ID=...
   GUILD_ID=...           # optional: your server's id, for instant guild-scoped command registration
   API_ORIGIN=https://backend.6mansdle.com
   BOT_API_TOKEN=...      # generate like SESSION_SECRET; must match the API's BOT_API_TOKEN below
   DAILY_CHANNEL_ID=...   # optional: channel id for the scheduled daily post
   ```
   Add the matching `BOT_API_TOKEN=...` to `/opt/6mansdle/app/.env` (the API's env file) so the
   two sides agree — the bot integration stays off until this is set there.
4. **Register the slash commands** (once, and again any time a command's shape changes):
   `npm run register -w apps/bot` (needs the same env as above — run it locally with a `.env` in
   `apps/bot`, or on the host after `bot.env` is in place).
5. **Deploy**: `infra/deploy.sh` installs and starts the `6mansdle-bot` systemd unit automatically
   once it sees `/opt/6mansdle/app/bot.env` — nothing else to do. Locally, `npm run dev -w apps/bot`
   or `npm run start -w apps/bot`.

## Production infrastructure (us-east-1, account 780930530902)

| Resource | Name |
| --- | --- |
| Aurora PostgreSQL 17 Serverless v2 cluster (min 0 ACU, auto-pause 10 min) | `sixmansdle`, endpoint `sixmansdle.cluster-ckb8wc0eyel2.us-east-1.rds.amazonaws.com` |
| App DB user / connection string | `sixmansdle_app`, stored in Secrets Manager `sixmansdle/database-url` |
| Master password | RDS-managed secret (never copied anywhere) |
| API host | EC2 `6mansdle-api` (i-01604db9d7bfc46e8, t4g.small, Amazon Linux 2023), Elastic IP 54.175.74.222, shell via SSM only |
| Instance role | `sixmansdle-api-role` (S3 clips prefix, app secrets) |
| Security groups | `sixmansdle-api-sg` (80/443 in), `sixmansdle-db-sg` (5432 from API only) |
| Clip bucket | `6mansdle-clips-780930530902` (private, CORS for browser PUT) |
| Server env file | `/opt/6mansdle/app/.env` (owned by `sixmansdle`, mode 600) |

Open a shell on the host with `aws ssm start-session --target i-01604db9d7bfc46e8`.

## Production notes

- Set `NODE_ENV=production`, `WEB_ORIGIN=https://6mansdle.com`, `API_ORIGIN=https://backend.6mansdle.com`.
- Register `https://backend.6mansdle.com/api/auth/discord/callback` in the Discord developer portal.
- The session cookie is `SameSite=None; Secure` in production so it works across the two hostnames. Serving
  API and site from one origin (nginx `/api` proxy) is simpler and lets you drop that.
- Give the API host an IAM role with `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on the bucket's
  `clips/*` prefix. Set `CDN_ORIGIN` if you front the bucket with CloudFront.
- `npm run build` produces `apps/api/dist` (run with `npm start -w apps/api`) and `apps/web/dist` (static).
- `customHttp.yml` at the repo root sets security response headers (CSP, HSTS, etc.) for the static site.
  Amplify Hosting picks this file up automatically from the repo root — no build-spec changes needed. See
  the comments in that file for what each CSP directive is for and why.
- `GET /api/version` returns `{ sha }`, the deployed git commit. `infra/deploy.sh` writes it to
  `/opt/6mansdle/app/version` on every deploy, and the systemd unit reads it via an optional
  (`EnvironmentFile=-`) env file, so a host that predates this change just serves `{ sha: null }`.

## Testing

`npm test` runs the whole suite: `packages/shared` typecheck, the API's unit and integration
tests, then the web unit tests, then the bot's unit tests.

- **API unit tests** (`npm run test:unit -w apps/api`) are pure — no database, no network. They
  cover small logic like the daily streak's date math.
- **API integration tests** (`npm run test:integration -w apps/api`) exercise the real Express
  app end-to-end with [supertest](https://github.com/ladjs/supertest) against a real local
  Postgres database, `sixmansdle_test`. They create it automatically and run migrations
  (`apps/api/test/support/globalSetup.ts`), then truncate every table before each test
  (`apps/api/test/support/setup.ts`). The S3-backed `services/storage.ts` module is mocked
  (`apps/api/test/support/storageMock.ts`) so no AWS calls ever happen. Auth uses the app's own
  `/api/auth/dev-login` route (only available outside production without Discord configured — see
  `apps/api/test/support/client.ts`). Requires a local Postgres reachable at
  `postgres://postgres:postgres@localhost:5432` (see `docker-compose.yml`); these tests run
  sequentially against one shared database, so they aren't safe to parallelise across files.
  `npm run test:integration:bot -w apps/api` covers the *enabled* `/api/bot/*` routes under a
  separate vitest config (`vitest.integration.bot.config.ts`) that sets `BOT_API_TOKEN`, since the
  main integration config deliberately leaves it unset to match a real not-yet-configured
  deployment (see `test/integration/botDisabled.test.ts` for that 503 path).
- **Web tests** (`npm test -w apps/web`) use Vitest + Testing Library + jsdom to cover the key
  components (`ActivityCalendar`, `RankPicker`, `GameBoard`) and the daily countdown's pure date
  math (`apps/web/src/lib/countdown.ts`).
- **Bot tests** (`npm run test -w apps/bot`) are pure unit tests — attachment validation
  (`src/lib/attachment.ts`), the daily-post scheduler's time math (`src/lib/scheduler.ts`), and
  Discord message formatting (`src/lib/messages.ts`). None of it imports discord.js or touches
  the network.
- **Bundle size** (`npm run test:bundle -w apps/web`) runs a production `vite build` and asserts
  on the resulting chunk sizes (`apps/web/test/bundle.test.ts`) — the entry chunk under 250 KB
  minified, no chunk over 450 KB. Not part of `npm test`; the manualChunks split in
  `apps/web/vite.config.ts` is what keeps recharts and framer-motion out of the entry chunk.
- **End-to-end** (`npm run e2e`, root) is a small [Playwright](https://playwright.dev) smoke suite
  (`e2e/`, Chromium only) that drives the real app in a browser: home, the daily (as a guest),
  endless mode (signed in), the leaderboard tabs, a profile page, the admin review flow, Blitz,
  and the 404 page. `e2e/support/global-setup.ts` spins up a throwaway API on port 3101 against
  its own database (`sixmansdle_e2e` by default, override with `E2E_DB_NAME`) and the Vite dev
  server on port 5273 (proxying to that API via `VITE_DEV_API_TARGET`, see
  `apps/web/vite.config.ts`), seeding 3 approved clips whose `s3_key`s point at public MDN sample
  videos so playback actually works (`CDN_ORIGIN=https://interactive-examples.mdn.mozilla.net`).
  Both throwaway servers are torn down after the run. Install the browser once with
  `npx playwright install chromium` before the first run. Not part of `npm test` — it needs a
  browser — and safe to run alongside the checkout's own dev servers on 3001/5173 since it never
  touches those ports or databases.

## Scripts

| Command                          | What it does                                            |
| --------------------------------- | -------------------------------------------------------- |
| `npm run dev`                     | API + web with hot reload                                |
| `npm run typecheck`               | Type-check every workspace (app and test code)           |
| `npm test`                        | Shared typecheck, API unit + integration tests, web tests, bot tests |
| `npm run test:unit -w apps/api`   | API unit tests only (no database)                        |
| `npm run test:integration -w apps/api` | API integration tests against `sixmansdle_test`      |
| `npm run test:integration:bot -w apps/api` | Enabled `/api/bot/*` integration tests (own config, sets `BOT_API_TOKEN`) |
| `npm run test:bundle -w apps/web` | Production web build + bundle-size budget check           |
| `npm run e2e`                     | Playwright smoke suite against a throwaway API + web stack |
| `npm run build`                   | Production build of API and web                          |
| `npm run db:migrate`              | Apply pending SQL migrations                              |
| `npm run dev -w apps/bot`         | Discord bot with hot reload                               |
| `npm run register -w apps/bot`    | Register the bot's slash commands with Discord            |
| `npm run test -w apps/bot`        | Bot unit tests (no network, no Discord connection)        |
