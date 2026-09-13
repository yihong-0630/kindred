# Kindred — the happiness ledger

A five-sense ritual agent with a personal → team → enterprise ledger.
Built for a 4-hour window: **zero npm dependencies, one command, no build step.**

```bash
npm start
```

Then open **http://localhost:4000** — that is the entry point for everything.

| | |
|---|---|
| **Entry point** | `http://localhost:4000/` — login + the pitch |
| **Phone app** | `http://localhost:4000/app` |
| **Dashboard** | `http://localhost:4000/dashboard` (team + enterprise layers) |
| **Judge access** | passcode from `JUDGE_PASSCODE` (default `kindred`) — one field, straight into the full demo |
| **Team accounts** | `aina@kindred.app` … `rob@kindred.app`, password `kindred` |

The database seeds itself on first boot: 4 teams, 12 people, three weeks of
ritual history with real patterns planted in it. `npm run reseed` starts over.

---

## The demo path (2 minutes)

1. **Open `/`**, hit **Open the ledger** with the judge passcode.
2. You land on the **team ledger**. Aina is compounding; Daniel has not shared a
   ritual in days and is flagged *elevated*.
3. Press **Run the scan**. The agent finds the two people who are both low at the
   same time, writes the invite, actuates two kettles, and posts to `#kindred`.
4. Switch to **Enterprise ledger** — aggregate signal only, cohort-suppressed.
5. Jump to the **phone app**, log a ritual, watch the reframe arrive, the balance
   move, and the sense tile in **Room** light up.
6. Back on **Today**, press **Run the audit** for the weekly statement.

## Demo on two devices (phone + laptop)

The server binds to `0.0.0.0`, so anything on the same wifi can reach it. On
boot it prints the LAN URL alongside the localhost one:

```
── on another device, same wifi ──────────────
en0         http://10.0.0.12:4000
phone app   http://10.0.0.12:4000/app
```

**The fast way:** open `/` on the laptop — the login screen shows a QR for the
phone app. Scan it, and the phone lands on the login, then straight into `/app`.
Mid-demo you can pull the same QR up from **Pair a phone** in the dashboard
header. (The QR is generated in `server/qr.js` — no dependency, no CDN, no
third-party service seeing your URL.)

**Suggested split:**

| Device | Signed in as | Shows |
|---|---|---|
| Phone | `aina@kindred.app` / `kindred` | `/app` — log rituals, watch reframes land |
| Laptop | judge passcode | `/dashboard` — team ledger on the projector |

The two stay in sync over SSE with no refresh: log a ritual on the phone and the
laptop's team capital, member table and `#kindred` channel all move within a
second. Run the scan on the laptop and the phone gets the invite as a toast.

**If the phone cannot reach it:**

- **macOS firewall.** The first external connection usually triggers an "allow
  incoming connections" prompt for `node` — click Allow. Test it before you are
  on stage, because a prompt nobody clicks looks like a broken demo.
- **Guest/conference wifi** often has client isolation, which blocks phone →
  laptop entirely. Fallback that needs no software: turn on the phone's hotspot
  and join the laptop to it, then restart the server so it picks up the new
  address.
- **Check reachability** from any device on the network:
  ```
  curl http://<laptop-ip>:4000/api/health
  ```

Everyone who signs in with the judge passcode shares one account, which acts on
the demo ledger — so several judges can scan the same QR at once and all see the
same story move.

## Mobile / APK clients

A native client (React Native, or anything else) talks to the same backend over
a public tunnel, authenticating with a bearer token instead of the web app's
cookie. Full contract in **[MOBILE.md](MOBILE.md)**. The short version:

```bash
npm start          # terminal 1
npm run tunnel     # terminal 2 — ngrok
npm run tunnel:url # the https:// URL to build into the app
```

`GET /api/mobile/config` returns the API base, required headers and endpoint map
at runtime, so a new tunnel URL never needs an app rebuild. Both login endpoints
return `{ token, user }`; send it as `Authorization: Bearer <token>`.

The pairing QR follows the tunnel automatically — open the login page through the
ngrok URL and the QR encodes the public address rather than the LAN one.

## The Happiness API

The finance metaphor is the architecture, not decoration — it all lives in
[`server/ledger.js`](server/ledger.js).

| Finance | Kindred | Implementation |
|---|---|---|
| Currency | Meaningful moments | `meaning` per logged ritual, scaled by mood and company |
| Ledger | Ritual history | `moments` table, never deleted |
| Balance | Happiness capital | exponential decay, 3.5-day half-life |
| Interest | Compounding of practice | 1.5%/day of streak, capped at 20% |
| Investment | Costs energy now, pays later | rituals flagged `invested` |
| Risk | Autopilot, isolation, burnout | isolation 40% / autopilot 35% / mood drag 25% |
| Portfolio | Solo · social · physical · reflective | normalised Herfindahl → diversification |
| Audit | Weekly statement | `GET /api/statement` |

**Input → processing → output** is one call: `POST /api/moments` takes one tap,
finds the pattern, writes the reframe, actuates the room and returns the whole
recomputed ledger.

## The five senses

Every ritual is bound to one sensory channel, and logging it actuates that
channel. Actuation is recorded in `actuations` and pushed to every open client
over SSE (`GET /api/events`) — swap the log line for a real GPIO/Hue/diffuser
call and nothing above it changes.

| | Sense | Device | Example |
|---|---|---|---|
| 👁️ | Sight | lamp | cold white → warm amber |
| 👂 | Hearing | chime | low bell closes a focus block |
| ✋ | Touch | token | turning the token logs a moment |
| 👃 | Smell | diffuser | citrus in the morning, cedar at night |
| 👅 | Taste | kettle | the shared cup, triggered for two people at once |

## The agent

`server/agent.js` has two engines and says which one ran, in the UI:

- **`openai`** — set `OPENAI_API_KEY` and reframes, statements and tea invites
  are generated by the model.
- **`local`** — the default. A rule-based reframe engine over the same ledger
  facts. The demo never depends on a network call.

Same for Slack: set `SLACK_WEBHOOK_URL` and team nudges really post; leave it
unset and they render in the in-app `#kindred` channel on the dashboard.

Copy `.env.example` to `.env` to set any of it. Nothing is required.

## Privacy

Personal moments, notes and reframes never leave the personal ledger. The team
layer sees balances, streaks and risk levels — not what anyone wrote. The
enterprise layer sees teams, never people, and suppresses any cohort under 4.
The psychological-safety number is labelled a *proxy* everywhere it appears.

Grounded in **PERMA + 4** (positive emotion, engagement, relationships, meaning,
accomplishment, plus physical health, mindset, environment, economic security) —
operationalised through rituals instead of surveys. Blocks with no ritual feeding
them are reported as unmeasured rather than scored zero.

## Layout

```
server/
  index.js     http server, static files, .env loader, page auth
  routes.js    the API
  db.js        schema (node:sqlite — built in, no native build)
  auth.js      scrypt passwords, HMAC-signed session cookies, judge passcode
  ledger.js    the Happiness API: balance, interest, risk, portfolio, patterns
  team.js      team rollup, enterprise signal, cohort suppression, tea pairing
  agent.js     reframes + statements + invites (openai | local)
  rituals.js   the ritual catalogue and its sensory bindings
  senses ->    actuation is emitted from routes.js through bus.js (SSE)
  seed.js      deterministic three-week demo org
web/
  index.html       entry point — login + pitch
  app.html         the phone: Today · Ledger · Patterns · Room
  dashboard.html   team ledger + enterprise ledger
  assets/          kindred.css, api.js, login.js, app.js, dashboard.js
```

## API

```
POST /api/auth/login     {email, password}
POST /api/auth/judge     {passcode}
GET  /api/me
GET  /api/rituals
GET  /api/ledger         personal ledger (judges may pass ?user=)
POST /api/moments        {ritualKey, mood, company, note} → reframe + actuation + ledger
GET  /api/statement      the weekly audit
GET  /api/team           team ledger (leads/judges may pass ?team=)
POST /api/agent/scan     find two people who are both low; send the invite
GET  /api/org            enterprise signal (leads + judges only)
GET  /api/senses         actuation log
GET  /api/channel        #kindred messages
GET  /api/events         SSE: live actuations and nudges
GET  /api/health
GET  /api/pairing        LAN URLs for the two-device demo (public)
GET  /qr.svg?url=…       QR for any URL, rendered server-side (public)
```
