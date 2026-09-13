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
3. Press **Run coffee matching**. The agent finds the two people who are both low at the
   same time, writes the invite, actuates two kettles, and posts to `#kindred`.
4. Switch to **Enterprise ledger** — aggregate signal only, cohort-suppressed.
5. Jump to the **phone app**. It opens on **Check-in** — Kindred says *"Hey, how
   are you feeling?"* out loud and waits. Answer by typing, tapping a chip, or
   tapping the mic and speaking.
6. After 4–5 questions it reads back what it heard, then offers **three actions**
   chosen for what you actually said — each with numbered steps and a link to the
   research it comes from. Press **I did this** and it posts to the ledger.
   **If the morning came back low, the agent does not wait to be asked** — it
   pairs Aina with the teammate who most needs the same five minutes and posts
   the tea invite to `#kindred` and Slack on the spot. Watch the laptop: the
   invite names them both, and both kettles come on.
7. Log a ritual on **Today**, watch the reframe arrive, the balance move, and the
   sense tile in **Room** light up.
8. Back on **Today**, press **Run the audit** for the weekly statement.

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
second. Run coffee matching on the laptop and the phone gets the invite as a toast.

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

## The morning check-in

The first thing Kindred does each day is ask a question and wait.

- **It speaks first.** On the first open of the day the browser says *"Hey, how
  are you feeling?"* aloud. Autoplay policy blocks speech before any gesture, so
  the greeting is armed to fire on the first tap if the browser refuses it.
- **Four to five questions**, not a fixed form. Two are always asked; the third
  branches on how the first one landed; the last two rotate so consecutive
  mornings do not read identically.
- **Answer however you like** — type it, tap a chip, or hold a conversation by
  voice. Speech recognition streams interim text so you can see you are heard,
  and if you answer by voice Kindred replies by voice.
- **Every answer is stored verbatim** in `checkin_answers`. What the agent
  *infers* is stored separately on the `checkins` row, so the log stays a record
  of what the person said rather than what the model decided they meant.
- **The read-back is a reflection, not advice.** "Aina at 1 out of 5, running hot
  and you want the room to yourself. What you kept coming back to was the room
  you are in."

Signals are read by a small, inspectable lexicon in `server/checkin.js` — mood,
energy, social lean, and up to four themes. It is deterministic: the same
answers always produce the same signals, which is what makes the stored log
auditable. With `OPENROUTER_API_KEY` set, the model writes the read-back *on top
of* those signals rather than replacing them.

## Recommended actions, and where they come from

Kindred recommends nothing it cannot cite.

Every action in the library carries a source, and most carry three: a **readable
write-up** a person will actually open (Harvard Health, Greater Good, Psychology
Today, Stanford Medicine), the **primary study** behind it, and a third from a
different publisher so no single outlet carries a claim alone.

```bash
npm run harvest          # search every topic, store citations, check the links
npm run verify-sources   # re-check every stored link
npm run harvest -- --topic awe-walk --topic weak-ties
```

`npm run harvest` needs `EXA_API_KEY` in `.env`. Without it Kindred falls back
to the 16 hand-entered practices in `server/practices.js` and the whole flow
still works.

**What the harvest does and does not do.** A topic seed in `server/research.js`
owns the *action* — the imperative Kindred puts in front of a person. Exa owns
the *citation*: it finds the strongest current article from an allowlist of 52
research and clinical publishers, and we store its real title, URL, date and the
sentence the claim rests on. The action is never paraphrased out of a snippet,
because that is how a wellbeing app ends up confidently wrong. Anything outside
the allowlist is discarded rather than scored low.

Two searches run per topic, because one blended ranking buries every readable
publisher under PubMed. Links are checked on the way in; a `403` from Science or
APA is recorded as `blocked`, not `dead`, since a DOI that redirects to a real
article has proved the record exists. Only `404`/`410` stops a practice being
recommended.

**How an action is picked.** Matched tags against what you said, weighted by
source credibility, the gaps in your ritual portfolio, your isolation risk, the
energy you reported, and whether you asked for company or space — minus anything
recommended in the last five days. Three are returned, one per ritual kind where
possible, and each names a *different* signal as its reason.

**Grounding.** Sixteen of the actions are grounding practices: eight somatic
(cyclic sighing, 5-4-3-2-1, feet on the floor, cold water, body scan, humming,
deep pressure, shaking it out) and eight environmental (open the window, change
the light, clear one surface, something living in eyeline, change the room, a
scent anchor, thirty minutes of silence, shift the temperature). When someone
reports it in their body or names the room, bottom-up beats anything that asks
them to think their way out of it first.

Taking an action closes the loop: **I did this** posts it to the ledger as a
ritual, earns meaning, fires the matching sense in the room, and records whether
the recommendation was taken — which is the only honest measure of whether any
of this works.

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

- **the model** — set `OPENROUTER_API_KEY` and reframes, statements, check-in
  read-backs and tea invites are generated by a model. The call goes through
  **OpenRouter**, which speaks the OpenAI chat-completions dialect, so one key
  reaches every model it fronts and `OPENROUTER_MODEL` picks between them:

  ```
  OPENROUTER_MODEL=openai/gpt-4o-mini          # cheap, fast, the default
  OPENROUTER_MODEL=anthropic/claude-3.5-haiku  # better at the short, concrete voice
  OPENROUTER_MODEL=google/gemini-flash-1.5     # cheapest of the three
  ```

  Switching provider is that one line — no code change, no redeploy. The pill in
  the app names whichever model actually answered rather than a brand.
- **`local`** — the default. A rule-based reframe engine over the same ledger
  facts. The demo never depends on a network call.

Every model call falls back to the local engine if it fails, and **says so on
stderr** — so a bad key or an empty OpenRouter balance looks like a warning in
the log rather than a demo that quietly got less interesting.

Same for Slack: set `SLACK_WEBHOOK_URL` and team nudges really post; leave it
unset and they render in the in-app `#kindred` channel on the dashboard.

Copy `.env.example` to `.env` to set any of it. Nothing is required.

## Privacy

Personal moments, notes and reframes never leave the personal ledger. The team
layer sees balances, streaks and risk levels — not what anyone wrote. The
enterprise layer sees teams, never people, and suppresses any cohort under 4.
The psychological-safety number is labelled a *proxy* everywhere it appears.

**Check-in answers are the most sensitive thing in the database** and are treated
as such. What someone types or says in the morning conversation is readable only
through their own personal ledger — no team or enterprise endpoint reads
`checkin_answers`, and nothing anyone wrote is ever quoted, summarised or
aggregated upward. Speech is transcribed by the browser's own speech API; no
audio is recorded, uploaded or stored anywhere. With no `OPENROUTER_API_KEY` set,
the answers never leave the machine at all — the signal reader and the
read-back both run locally.

One thing does cross into the team layer, deliberately and narrowly: **whether
this morning was a low one**. The team view reads three derived columns from the
`checkins` row — mood, energy, social lean — and never the answers behind them.
That is what lets the agent pair someone with a teammate within minutes of them
saying they are struggling, instead of waiting a week for the gap to show up in
their ritual history. The channel sees *"Aina checked in low this morning"* —
the same level of disclosure the member table has always carried as a risk
level, and not one word of what she actually said. The enterprise layer sees
none of it.

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
  agent.js     reframes + statements + invites + check-in read-back (openrouter | local)
  checkin.js   the morning conversation: questions, answer parsing, signals
  recommend.js ranking evidence against what someone just said
  research.js  Exa harvest, source allowlist, link checking
  practices.js the 16 hand-entered practices (the offline fallback)
  steps.js     the how-to-do-it instructions, written separately from the evidence
  harvest.js   CLI: npm run harvest / npm run verify-sources
  rituals.js   the ritual catalogue and its sensory bindings
  senses ->    actuation is emitted from routes.js through bus.js (SSE)
  seed.js      deterministic three-week demo org
web/
  index.html       entry point — login + pitch
  app.html         the phone: Check-in · Today · Ledger · Patterns · Room
  dashboard.html   team ledger + enterprise ledger
  assets/          kindred.css, api.js, login.js, app.js, dashboard.js,
                   checkin.js, checkin-view.js, voice.js
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
GET  /api/checkin/today  today's conversation: next question, answers so far, greeting
POST /api/checkin/answer {questionKey, answer, modality} → next question, or the read-back + actions
POST /api/checkin/restart  clear today's conversation and start again
GET  /api/checkins       the last three weeks of check-ins, and recommendation uptake
POST /api/recommendations/accept  {id} → posts the action to the ledger
GET  /api/practices      the evidence library, with every citation (?tag= to filter)
POST /api/research/harvest  re-run the Exa harvest (leads + judges)
POST /api/research/verify   re-check every stored link (leads + judges)
GET  /api/team           team ledger (leads/judges may pass ?team=)
POST /api/agent/scan     coffee matching: find two people who are both low; send the invite
                         (also fires automatically when a check-in reports a low morning)
GET  /api/org            enterprise signal (leads + judges only)
GET  /api/senses         actuation log
GET  /api/channel        #kindred messages
GET  /api/events         SSE: live actuations and nudges
GET  /api/health
GET  /api/pairing        LAN URLs for the two-device demo (public)
GET  /qr.svg?url=…       QR for any URL, rendered server-side (public)
```
