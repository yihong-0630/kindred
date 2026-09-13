import { all, get, run } from './db.js';
import { currentUser, issueToken, login, judgeLogin, sessionCookie, clearCookie } from './auth.js';
import { RITUALS, BY_KEY, SENSES, PERMA } from './rituals.js';
import { ledgerFor, momentsFor, balanceOf, streakOf } from './ledger.js';
import { teamLedger, orgLedger, findTeaPair } from './team.js';
import { reframeMoment, weeklyStatement, teaInvite, actuationFor, engineName } from './agent.js';
import { postToSlack } from './slack.js';
import { emit } from './bus.js';

const now = () => new Date().toISOString();
const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};
const requireUser = (req, res) => {
  const user = currentUser(req);
  if (!user) { json(res, 401, { error: 'not_authenticated' }); return null; }
  return user;
};
const canSeeOrg = (user) => user.role === 'lead' || user.role === 'judge';

/**
 * The judge account owns no rituals of its own — it acts on the demo ledger so
 * that anything a judge logs shows up in the same story they are reading.
 */
const DEMO_EMAIL = 'aina@kindred.app';
const effectiveUser = (user) =>
  (user.role === 'judge' ? get('SELECT id, team_id, name, email, role, avatar FROM users WHERE email = ?', DEMO_EMAIL) : null) || user;

function recordActuation(userId, act) {
  if (!act) return null;
  run('INSERT INTO actuations (user_id, sense, device, action, detail, created_at) VALUES (?,?,?,?,?,?)',
    userId, act.sense, act.device, act.action, act.detail || '', now());
  emit('actuation', { userId, ...act });
  return act;
}

function saveNudge(n) {
  run(`INSERT INTO nudges (scope, team_id, user_id, audience, channel, kind, text, engine, delivered, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    n.scope, n.team_id ?? null, n.user_id ?? null, n.audience ?? null,
    n.channel, n.kind, n.text, n.engine || 'local', n.delivered ? 1 : 0, now());
  const saved = get('SELECT * FROM nudges ORDER BY id DESC LIMIT 1');
  emit('nudge', { nudge: saved });
  return saved;
}

export const routes = {
  // ------------------------------------------------------------------- auth
  'POST /api/auth/login': async (req, res, { body }) => {
    const user = login(body.email, body.password);
    if (!user) return json(res, 401, { error: 'bad_credentials' });
    res.setHeader('set-cookie', sessionCookie(issueToken(user.id)));
    json(res, 200, { user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, team_id: user.team_id } });
  },

  'POST /api/auth/judge': async (req, res, { body }) => {
    const user = judgeLogin(body.passcode);
    if (!user) return json(res, 401, { error: 'bad_passcode' });
    res.setHeader('set-cookie', sessionCookie(issueToken(user.id)));
    json(res, 200, { user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, team_id: user.team_id } });
  },

  'POST /api/auth/logout': async (req, res) => {
    res.setHeader('set-cookie', clearCookie());
    json(res, 200, { ok: true });
  },

  'GET /api/me': async (req, res) => {
    const user = currentUser(req);
    if (!user) return json(res, 401, { error: 'not_authenticated' });
    const team = user.team_id ? get('SELECT t.*, o.name AS org_name, o.id AS org_id FROM teams t JOIN orgs o ON o.id = t.org_id WHERE t.id = ?', user.team_id) : null;
    json(res, 200, { user, team, canSeeOrg: canSeeOrg(user), engine: engineName(), slack: Boolean(process.env.SLACK_WEBHOOK_URL) });
  },

  'GET /api/people': async (req, res) => {
    const user = requireUser(req, res); if (!user) return;
    json(res, 200, { people: all("SELECT id, name, avatar, role, team_id FROM users WHERE role != 'judge' ORDER BY name") });
  },

  // ---------------------------------------------------------------- rituals
  'GET /api/rituals': async (req, res) => json(res, 200, { rituals: RITUALS, senses: SENSES, perma: PERMA }),

  // ----------------------------------------------------------- the ledger
  'GET /api/ledger': async (req, res, { url }) => {
    const user = requireUser(req, res); if (!user) return;
    const asParam = Number(url.searchParams.get('user'));
    let target = user;
    if (asParam && asParam !== user.id) {
      // A judge may read any ledger; anyone else only their own.
      if (user.role !== 'judge') return json(res, 403, { error: 'forbidden' });
      target = get('SELECT id, team_id, name, avatar, role FROM users WHERE id = ?', asParam) || user;
    }
    target = effectiveUser(target);
    json(res, 200, { ledger: ledgerFor(target), viewingSelf: target.id === user.id });
  },

  /** Input → processing → output. The whole Happiness API in one call. */
  'POST /api/moments': async (req, res, { body }) => {
    const actor = requireUser(req, res); if (!actor) return;
    const user = effectiveUser(actor);
    const ritual = BY_KEY[body.ritualKey];
    if (!ritual) return json(res, 400, { error: 'unknown_ritual' });

    const mood = Math.max(1, Math.min(5, Number(body.mood) || 3));
    const company = body.company === 'with' ? 'with' : 'alone';
    const meaning = +(ritual.base * (0.75 + mood / 10) * (company === 'with' ? 1.15 : 1)).toFixed(2);

    const prior = momentsFor(user.id, 30);
    const balance = balanceOf(prior);
    const streak = streakOf(prior);
    const lastSimilar = prior.find((m) => m.ritual_key === ritual.key)?.mood;
    const insight = ledgerFor(user).insights[0]?.text;

    const { text: reframe, engine } = await reframeMoment({
      ritualKey: ritual.key, mood, company, note: body.note, balance, streak, lastSimilar, insight
    });

    run(`INSERT INTO moments (user_id, ritual_key, label, sense, kind, meaning, mood, company, invested, note, reframe, source, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      user.id, ritual.key, ritual.label, ritual.sense, ritual.kind, meaning, mood, company,
      ritual.invested, body.note || null, reframe, body.source || 'app', now());
    const moment = get('SELECT * FROM moments ORDER BY id DESC LIMIT 1');

    const actuation = recordActuation(user.id, actuationFor(ritual.key));
    const nudge = saveNudge({ scope: 'personal', user_id: user.id, team_id: user.team_id, channel: 'app', kind: 'reframe', text: reframe, engine });
    emit('moment', { userId: user.id, moment });

    json(res, 201, { moment, reframe, engine, actuation, nudge, ledger: ledgerFor(user) });
  },

  'GET /api/statement': async (req, res) => {
    const user = requireUser(req, res); if (!user) return;
    const target = effectiveUser(user);
    const ledger = ledgerFor(target);
    const { text, engine } = await weeklyStatement(ledger);
    saveNudge({ scope: 'personal', user_id: target.id, team_id: target.team_id, channel: 'app', kind: 'statement', text, engine });
    json(res, 200, { statement: text, engine, ledger });
  },

  // ------------------------------------------------------------ team layer
  'GET /api/team': async (req, res, { url }) => {
    const user = requireUser(req, res); if (!user) return;
    const requested = Number(url.searchParams.get('team'));
    const teamId = requested && canSeeOrg(user) ? requested : user.team_id;
    if (!teamId) return json(res, 404, { error: 'no_team' });
    const ledger = teamLedger(teamId);
    const nudges = all('SELECT * FROM nudges WHERE team_id = ? AND scope != ? ORDER BY id DESC LIMIT 20', teamId, 'personal');
    json(res, 200, { ...ledger, nudges, teaPair: findTeaPair(teamId) });
  },

  /**
   * The agent scanning the team for two people who are both low at the same
   * time, then spending its one message of the day on them.
   */
  'POST /api/agent/scan': async (req, res, { body }) => {
    const user = requireUser(req, res); if (!user) return;
    const teamId = Number(body.teamId) || user.team_id;
    const pair = findTeaPair(teamId);
    if (!pair) return json(res, 200, { found: false, reason: 'Nobody on this team is drifting right now. The agent stays quiet.' });

    const { text, engine } = await teaInvite(pair[0], pair[1]);
    const delivery = await postToSlack(text);
    const nudge = saveNudge({
      scope: 'team', team_id: teamId, audience: pair.map((p) => p.name).join(', '),
      channel: delivery.channel, kind: 'invite', text, engine, delivered: delivery.delivered
    });
    for (const p of pair) recordActuation(p.id, { sense: 'taste', device: 'kettle', action: 'brew', detail: 'The shared cup' });
    json(res, 200, { found: true, pair, nudge, delivery, engine });
  },

  // ------------------------------------------------------ enterprise layer
  'GET /api/org': async (req, res) => {
    const user = requireUser(req, res); if (!user) return;
    if (!canSeeOrg(user)) return json(res, 403, { error: 'forbidden', hint: 'Enterprise ledger is visible to team leads and judges.' });
    const team = get('SELECT org_id FROM teams WHERE id = ?', user.team_id);
    json(res, 200, orgLedger(team?.org_id || 1));
  },

  // ---------------------------------------------------- the room + channel
  'GET /api/senses': async (req, res) => {
    const user = requireUser(req, res); if (!user) return;
    const scope = canSeeOrg(user) ? '' : ' AND a.user_id = ' + Number(user.id);
    json(res, 200, {
      senses: SENSES,
      recent: all(`SELECT a.*, u.name, u.avatar FROM actuations a JOIN users u ON u.id = a.user_id
                   WHERE 1=1 ${scope} ORDER BY a.id DESC LIMIT 25`)
    });
  },

  'GET /api/channel': async (req, res) => {
    const user = requireUser(req, res); if (!user) return;
    json(res, 200, {
      slackConnected: Boolean(process.env.SLACK_WEBHOOK_URL),
      messages: all(`SELECT n.*, u.name AS user_name, u.avatar FROM nudges n LEFT JOIN users u ON u.id = n.user_id
                     WHERE n.scope != 'personal' OR n.kind = 'statement' ORDER BY n.id DESC LIMIT 30`)
    });
  },

  'GET /api/health': async (req, res) => json(res, 200, {
    ok: true,
    engine: engineName(),
    slack: Boolean(process.env.SLACK_WEBHOOK_URL),
    users: get('SELECT count(*) AS n FROM users').n,
    moments: get('SELECT count(*) AS n FROM moments').n
  })
};
