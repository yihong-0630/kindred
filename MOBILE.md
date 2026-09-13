# Kindred mobile API contract

What a React Native client needs to talk to this backend. Nothing here requires
the RN app to live in this repo — point it at a base URL and go.

## 1. Get a base URL

The APK should not hardcode a LAN IP; it will not survive leaving the building
or the laptop changing networks. Run a tunnel and use its URL:

```bash
npm start          # terminal 1
npm run tunnel     # terminal 2
npm run tunnel:url # prints https://<something>.ngrok-free.app
```

Then fetch everything else at runtime, so a new tunnel URL never needs a rebuild:

```
GET /api/mobile/config
```

```jsonc
{
  "apiBase": "https://f816-96-9-170-14.ngrok-free.app",
  "auth": { "mode": "bearer", "loginPath": "/api/auth/login", "judgePath": "/api/auth/judge" },
  "requiredHeaders": { "ngrok-skip-browser-warning": "true" },
  "endpoints": { "ledger": "/api/ledger", "logMoment": "POST /api/moments", ... },
  "features": { "liveEvents": true, "slack": true, "agentEngine": "local" }
}
```

`apiBase` is derived from the request, so calling it *through* the tunnel returns
the tunnel URL, and calling it over the LAN returns the LAN URL. Set `PUBLIC_URL`
in `.env` to override both.

**Send every header in `requiredHeaders` on every request.** On ngrok's free tier
a missing `ngrok-skip-browser-warning` gets you an HTML interstitial with a 200
status instead of your JSON — which looks like a parse bug, not an auth problem.

## 2. Authenticate with a bearer token, not cookies

The web app uses an HttpOnly cookie. A native client cannot, so both login
endpoints also return the token in the body:

```
POST /api/auth/login   { "email": "aina@kindred.app", "password": "kindred" }
POST /api/auth/judge   { "passcode": "kindred" }
→ 200 { "token": "<base64url>.<sig>", "user": { id, name, email, role, avatar, team_id } }
→ 401 { "error": "bad_credentials" | "bad_passcode" }
```

Store the token (`expo-secure-store`), then send it on every call:

```js
const res = await fetch(`${apiBase}/api/ledger`, {
  headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' }
});
```

Tokens are HMAC-signed and carry a 7-day expiry. There is no refresh endpoint:
on a 401, send the user back to login. Rotating `KINDRED_SECRET` invalidates
every existing token.

## 3. CORS

Native `fetch` is not subject to CORS, so this only matters if you run the app
in Expo web. `/api/*` and `/qr.svg` allow any origin, allow `GET, POST, OPTIONS`
and the `content-type`, `authorization` and `ngrok-skip-browser-warning` headers.

`Access-Control-Allow-Credentials` is deliberately **not** set. That is what
makes `*` safe: a browser will never attach the session cookie cross-origin, so
only a deliberately-attached bearer token authenticates. Do not "fix" this by
adding credentials support without also narrowing the origin allowlist.

## 4. The endpoints worth wiring first

| Call | Returns |
|---|---|
| `GET /api/me` | user, team, `canSeeOrg`, which agent engine is running |
| `GET /api/rituals` | the 12-ritual catalogue + sense metadata — drives the log screen |
| `GET /api/ledger` | balance, interest, risk, portfolio, PERMA+4, 14-day series, insights, recent moments |
| `POST /api/moments` | **the core loop**, see below |
| `GET /api/statement` | the weekly audit sentence |
| `GET /api/team` | team rollup, at-risk members, `#kindred` nudges |
| `GET /api/org` | enterprise signal — leads and judges only, else 403 |

### The core loop

```
POST /api/moments
{ "ritualKey": "walk", "mood": 5, "company": "alone", "note": "rain", "source": "mobile" }
```

Returns the reframe, the sensory actuation, and the fully recomputed ledger in
one response — so the client can update every screen from a single call:

```jsonc
{
  "moment":    { "id": 526, "label": "Walk outside", "meaning": 2.25, ... },
  "reframe":   "The rain is not ruining your walk. It is giving you permission to slow down.",
  "engine":    "local",              // or "openai" when OPENAI_API_KEY is set
  "actuation": { "sense": "touch", "device": "token", "action": "turn" },
  "ledger":    { "balance": 45.6, "interest": {...}, "risk": {...}, ... }
}
```

`ritualKey` must be one of the keys from `GET /api/rituals` — anything else is a
400. `mood` is clamped to 1–5, `company` is `alone` or `with`.

Pass `"source": "mobile"` so moments logged from the APK are distinguishable in
the ledger from web ones.

## 5. Live updates

`GET /api/events` is a Server-Sent Events stream of `actuation`, `moment` and
`nudge` events, server-wide. It is what makes the phone and the dashboard move
together.

RN has no native `EventSource`. Either add `react-native-sse`, or poll
`GET /api/ledger` and `GET /api/team` every few seconds — at demo scale the
polling is not noticeably worse, and it is one less dependency to debug on
stage.

## 6. Roles

| Account | Password | Sees |
|---|---|---|
| `aina@kindred.app` | `kindred` | own ledger + team; `lead`, so also `/api/org` |
| `daniel@kindred.app` | `kindred` | own ledger + team; elevated risk, good for the "drifting" screen |
| judge passcode | `JUDGE_PASSCODE` | everything; acts on Aina's ledger so anything logged shows up in the demo story |

A member requesting another person's ledger or `/api/org` gets a 403. Build the
UI so those are hidden rather than erroring.

## 7. Gotchas that will cost you an hour

- **Interstitial HTML with a 200 status** — missing `ngrok-skip-browser-warning`.
- **401 on every call after a restart** — `KINDRED_SECRET` changed, or you are
  sending the cookie instead of the header. Native clients must use the header.
- **`POST /api/agent/scan` posts to a real Slack channel** when
  `SLACK_WEBHOOK_URL` is set. Do not wire it to a button you will tap while
  testing.
- **Android cleartext**: `http://<lan-ip>` is blocked by default on modern
  Android. Use the `https://` tunnel URL, or add a network-security config. This
  is the single most common reason a working API "does nothing" in the APK.
