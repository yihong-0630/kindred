import { all, get, run } from './db.js';
import { currentUser, issueToken, login, judgeLogin, sessionCookie, clearCookie } from './auth.js';
import { RITUALS, BY_KEY, SENSES, PERMA } from './rituals.js';
import { ledgerFor, momentsFor, balanceOf, streakOf } from './ledger.js';
import { teamLedger, orgLedger, findTeaPair } from './team.js';
import { reframeMoment, weeklyStatement, teaInvite, actuationFor, engineName, modelName, checkinSummary, recommendationNote } from './agent.js';
import {
  planQuestions, QUESTIONS, readSignals, recordAnswer, openCheckin, answersFor,
  finishCheckin, localSummary, todaysCheckin, recentCheckins, localDay
} from './checkin.js';
import { recommendFor, saveRecommendations, recommendationsFor, acceptRecommendation, uptakeFor, withSources } from './recommend.js';
import { harvest, researchEnabled, practiceStats, verifyAllLinks, TOPICS } from './research.js';
import { postToSlack } from './slack.js';
import { emit } from './bus.js';
import { lanAddresses, primaryAddress, publicOrigin, isTunnelled } from './net.js';
import { svg as qrSvg } from './qr.js';

const now = () => new Date().toISOString();
const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, avatar: u.avatar, team_id: u.team_id });

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

/**
 * The agent's one message of the day: find two people who are both low, write
 * the invite, put the kettle on for both of them, and post it.
 *
 * Lives here rather than in the route because two things trigger it now — the
 * dashboard button, and finishing a check-in that reports a low morning.
 */
async function runTeaScan(teamId) {
  const pair = findTeaPair(teamId);
  if (!pair) return { found: false, reason: 'Nobody on this team is drifting right now. The agent stays quiet.' };

  const { text, engine } = await teaInvite(pair[0], pair[1]);
  const delivery = await postToSlack(text);
  const nudge = saveNudge({
    scope: 'team', team_id: teamId, audience: pair.map((p) => p.name).join(', '),
    channel: delivery.channel, kind: 'invite', text, engine, delivered: delivery.delivered
  });
  for (const p of pair) recordActuation(p.id, { sense: 'taste', device: 'kettle', action: 'brew', detail: 'The shared cup' });
  return { found: true, pair, nudge, delivery, engine };
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
    const token = issueToken(user.id);
    res.setHeader('set-cookie', sessionCookie(token));
    // The cookie serves the web app; `token` is here for native clients, which
    // have no cookie jar and send it back as `Authorization: Bearer <token>`.
    json(res, 200, { token, user: publicUser(user) });
  },

  'POST /api/auth/judge': async (req, res, { body }) => {
    const user = judgeLogin(body.passcode);
    if (!user) return json(res, 401, { error: 'bad_passcode' });
    const token = issueToken(user.id);
    res.setHeader('set-cookie', sessionCookie(token));
    json(res, 200, { token, user: publicUser(user) });
  },

  'POST /api/auth/logout': async (req, res) => {
    res.setHeader('set-cookie', clearCookie());
    json(res, 200, { ok: true });
  },

  'GET /api/me': async (req, res) => {
    const user = currentUser(req);
    if (!user) return json(res, 401, { error: 'not_authenticated' });
    const team = user.team_id ? get('SELECT t.*, o.name AS org_name, o.id AS org_id FROM teams t JOIN orgs o ON o.id = t.org_id WHERE t.id = ?', user.team_id) : null;
    json(res, 200, { user, team, canSeeOrg: canSeeOrg(user), engine: engineName(), model: modelName(), slack: Boolean(process.env.SLACK_WEBHOOK_URL) });
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

  // -------------------------------------------------------- the daily check-in
  //
  // Opening the app is a conversation, not a dashboard. The client asks for
  // today's check-in, gets the next unanswered question, and posts answers back
  // one at a time so a half-finished conversation survives a closed tab.

  'GET /api/checkin/today': async (req, res) => {
    const actor = requireUser(req, res); if (!actor) return;
    const user = effectiveUser(actor);
    const checkin = todaysCheckin(user.id);
    const answers = checkin ? answersFor(checkin.id) : [];
    const signals = answers.length ? readSignals(answers) : { mood: 3, energy: 'steady', social: 'neutral', themes: [], intent: null };
    const script = planQuestions(signals);
    const asked = new Set(answers.map((a) => a.question_key));
    const next = script.find((q) => !asked.has(q.key)) || null;

    json(res, 200, {
      day: localDay(),
      checkin,
      answers,
      done: Boolean(checkin?.completed),
      // The first launch of the day is the only time Kindred speaks first.
      greeting: !checkin || !answers.length ? QUESTIONS.feeling.spoken : null,
      question: next && { key: next.key, text: next.text(), chips: next.chips },
      step: answers.length + 1,
      total: script.length,
      summary: checkin?.summary || null,
      recommendations: checkin ? recommendationsFor(checkin.id) : [],
      engine: engineName()
    });
  },

  'POST /api/checkin/answer': async (req, res, { body }) => {
    const actor = requireUser(req, res); if (!actor) return;
    const user = effectiveUser(actor);
    const answer = String(body.answer ?? '').trim();
    if (!answer) return json(res, 400, { error: 'empty_answer' });

    const checkin = openCheckin(user.id);
    if (checkin.completed) return json(res, 409, { error: 'already_completed', checkin });

    const asked = new Set(answersFor(checkin.id).map((a) => a.question_key));
    const question = QUESTIONS[body.questionKey];
    if (!question) return json(res, 400, { error: 'unknown_question' });
    if (asked.has(question.key)) return json(res, 409, { error: 'already_answered' });

    recordAnswer(checkin.id, {
      questionKey: question.key, question: body.question || question.text(),
      answer, modality: body.modality
    });

    const answers = answersFor(checkin.id);
    const signals = readSignals(answers);
    const script = planQuestions(signals);
    const answeredKeys = new Set(answers.map((a) => a.question_key));
    const next = script.find((q) => !answeredKeys.has(q.key)) || null;

    if (next) {
      return json(res, 200, {
        done: false, signals,
        question: { key: next.key, text: next.text(), chips: next.chips },
        step: answers.length + 1, total: script.length
      });
    }

    // Last answer in: read it back, then recommend.
    const { text: summary, engine } = await checkinSummary({
      name: user.name, signals, answers, fallback: localSummary(signals, user.name)
    });
    finishCheckin(checkin.id, signals, summary);

    const ledger = ledgerFor(user);
    const picks = recommendFor({ user, signals, ledger });
    // The model gets to say why this one today; the ranking reason is the fallback.
    for (const p of picks) {
      const note = await recommendationNote({ name: user.name, signals, practice: p, fallback: p.reason });
      p.reason = note.text;
    }
    saveRecommendations(user.id, checkin.id, picks);
    saveNudge({ scope: 'personal', user_id: user.id, team_id: user.team_id, channel: 'app', kind: 'statement', text: summary, engine });
    emit('checkin', { userId: user.id, mood: signals.mood, energy: signals.energy });

    // A low morning, just reported, is the freshest signal the team layer will
    // ever get — so the agent looks for someone to pair them with immediately
    // rather than waiting to be asked. A Slack outage must never cost someone
    // their read-back, so this can fail without failing the check-in.
    let tea = null;
    if (user.team_id && (signals.mood <= 2 || signals.energy === 'flat')) {
      try {
        tea = await runTeaScan(user.team_id);
      } catch (err) {
        console.error('! tea scan after check-in', err);
      }
    }

    json(res, 200, {
      done: true, signals, summary, engine, tea,
      checkin: get('SELECT * FROM checkins WHERE id = ?', checkin.id),
      recommendations: recommendationsFor(checkin.id),
      step: answers.length, total: script.length
    });
  },

  /** Demo affordance: clear today's conversation and start it again. */
  'POST /api/checkin/restart': async (req, res) => {
    const actor = requireUser(req, res); if (!actor) return;
    const user = effectiveUser(actor);
    const checkin = todaysCheckin(user.id);
    if (checkin) run('DELETE FROM checkins WHERE id = ?', checkin.id);
    json(res, 200, { ok: true, greeting: QUESTIONS.feeling.spoken });
  },

  'GET /api/checkins': async (req, res) => {
    const actor = requireUser(req, res); if (!actor) return;
    const user = effectiveUser(actor);
    json(res, 200, { checkins: recentCheckins(user.id, 21), uptake: uptakeFor(user.id) });
  },

  // ---------------------------------------------------- recommended actions

  'POST /api/recommendations/accept': async (req, res, { body }) => {
    const actor = requireUser(req, res); if (!actor) return;
    const user = effectiveUser(actor);
    const rec = get('SELECT * FROM recommendations WHERE id = ? AND user_id = ?', Number(body.id), user.id);
    if (!rec) return json(res, 404, { error: 'no_such_recommendation' });
    const practice = get('SELECT * FROM practices WHERE id = ?', rec.practice_id);

    // Taking an evidence-backed action is a ritual — post it to the ledger so
    // the recommendation and the currency it produced are the same object.
    let moment = null, reframe = null, actuation = null;
    const ritual = practice.ritual_key ? BY_KEY[practice.ritual_key] : null;
    if (body.log !== false && ritual) {
      const mood = Math.max(1, Math.min(5, Number(body.mood) || 4));
      const company = ritual.kind === 'social' ? 'with' : 'alone';
      const meaning = +(ritual.base * (0.75 + mood / 10) * (company === 'with' ? 1.15 : 1)).toFixed(2);
      const prior = momentsFor(user.id, 30);
      const out = await reframeMoment({
        ritualKey: ritual.key, mood, company, note: practice.action,
        balance: balanceOf(prior), streak: streakOf(prior)
      });
      reframe = out.text;
      run(`INSERT INTO moments (user_id, ritual_key, label, sense, kind, meaning, mood, company, invested, note, reframe, source, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,'app',?)`,
        user.id, ritual.key, ritual.label, ritual.sense, ritual.kind, meaning, mood, company,
        ritual.invested, practice.action, reframe, now());
      moment = get('SELECT * FROM moments ORDER BY id DESC LIMIT 1');
      actuation = recordActuation(user.id, actuationFor(ritual.key));
      emit('moment', { userId: user.id, moment });
    }

    acceptRecommendation(rec.id, user.id, moment?.id ?? null);
    json(res, 200, { ok: true, moment, reframe, actuation, ledger: ledgerFor(user) });
  },

  // --------------------------------------------------- the evidence library

  'GET /api/practices': async (req, res, { url }) => {
    const user = requireUser(req, res); if (!user) return;
    const tag = url.searchParams.get('tag');
    const rows = all("SELECT * FROM practices WHERE link_status != 'dead' ORDER BY credibility DESC, id");
    json(res, 200, {
      practices: (tag ? rows.filter((p) => p.tags.split(',').includes(tag)) : rows).map(withSources),
      stats: practiceStats(),
      research: { enabled: researchEnabled(), topics: TOPICS.length }
    });
  },

  /**
   * The raw citation table behind the library, flattened: every practice's own
   * source plus every supporting source, newest harvest first. Truncated on the
   * server so the modal never pulls the whole database over the wire.
   */
  'GET /api/citations': async (req, res, { url }) => {
    const user = requireUser(req, res); if (!user) return;
    const limit = Math.min(Number(url.searchParams.get('limit')) || 60, 300);
    // A source stored twice — once on the practice, once as a supporting row —
    // is one citation, not two. The table is deduplicated by URL so it reads as
    // a bibliography rather than a join result.
    const union = `SELECT source_title AS title, source_publisher AS publisher, source_url AS url,
                          evidence, link_status, engine, action AS practice, credibility
                   FROM practices
                   UNION ALL
                   SELECT s.title, s.publisher, s.url, s.evidence, s.link_status,
                          'exa' AS engine, p.action AS practice, s.credibility
                   FROM practice_sources s JOIN practices p ON p.id = s.practice_id`;
    const rows = all(`SELECT title, publisher, url, evidence, link_status, engine, practice,
                             max(credibility) AS credibility
                      FROM (${union}) WHERE link_status != 'dead'
                      GROUP BY url ORDER BY credibility DESC, publisher LIMIT ?`, limit);
    json(res, 200, {
      citations: rows,
      total: get(`SELECT count(*) AS n FROM (SELECT url FROM (${union}) WHERE link_status != 'dead' GROUP BY url)`).n,
      shown: rows.length
    });
  },

  /**
   * Run the Exa harvest. Guarded to leads and judges — it spends API credit and
   * rewrites the evidence library everyone else reads.
   */
  'POST /api/research/harvest': async (req, res) => {
    const user = requireUser(req, res); if (!user) return;
    if (!canSeeOrg(user)) return json(res, 403, { error: 'forbidden', hint: 'Harvesting is restricted to team leads and judges.' });
    if (!researchEnabled()) return json(res, 503, { error: 'no_exa_key', hint: 'Set EXA_API_KEY in .env and restart.' });
    try {
      const report = await harvest({ onProgress: (e) => emit('harvest', { topic: e.slug, kept: e.kept, error: e.error }) });
      json(res, 200, { ...report, stats: practiceStats() });
    } catch (err) {
      json(res, 502, { error: 'harvest_failed', message: String(err.message || err) });
    }
  },

  'POST /api/research/verify': async (req, res) => {
    const user = requireUser(req, res); if (!user) return;
    if (!canSeeOrg(user)) return json(res, 403, { error: 'forbidden' });
    json(res, 200, { ...(await verifyAllLinks()), stats: practiceStats() });
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
    json(res, 200, await runTeaScan(Number(body.teamId) || user.team_id));
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

  /**
   * Two-device demo: the laptop shows this, the phone scans it. Public on
   * purpose — the phone needs it before anyone has logged in.
   */
  'GET /api/pairing': async (req, res, { url }) => {
    const port = url.port || process.env.PORT || 4000;
    const origin = publicOrigin(req, port);
    json(res, 200, {
      appUrl: `${origin}/app`,
      dashboardUrl: `${origin}/dashboard`,
      origin,
      tunnelled: isTunnelled(req),
      addresses: lanAddresses().map((a) => ({ ...a, url: `http://${a.address}:${port}` })),
      reachable: origin !== `http://localhost:${port}`
    });
  },

  /**
   * What a packaged APK asks for on first run so it does not have to be rebuilt
   * every time the tunnel URL changes. The app stores `apiBase` and sends
   * `Authorization: Bearer <token>` from POST /api/auth/login or /api/auth/judge.
   */
  'GET /api/mobile/config': async (req, res, { url }) => {
    const port = url.port || process.env.PORT || 4000;
    const origin = publicOrigin(req, port);
    json(res, 200, {
      apiBase: origin,
      auth: {
        mode: 'bearer',
        loginPath: '/api/auth/login',
        judgePath: '/api/auth/judge',
        header: 'Authorization: Bearer <token>',
        note: 'Both login endpoints return { token, user }. Cookies are for the web app only.'
      },
      // ngrok's free tier serves a browser interstitial unless this is present.
      requiredHeaders: isTunnelled(req) ? { 'ngrok-skip-browser-warning': 'true' } : {},
      endpoints: {
        me: '/api/me',
        rituals: '/api/rituals',
        ledger: '/api/ledger',
        logMoment: 'POST /api/moments',
        statement: '/api/statement',
        team: '/api/team',
        org: '/api/org',
        senses: '/api/senses',
        channel: '/api/channel',
        events: '/api/events'
      },
      features: {
        liveEvents: true,
        slack: Boolean(process.env.SLACK_WEBHOOK_URL),
        agentEngine: engineName()
      },
      ritualCount: RITUALS.length,
      serverTime: now()
    });
  },

  'GET /api/health': async (req, res) => json(res, 200, {
    ok: true,
    engine: engineName(),
    model: modelName(),
    slack: Boolean(process.env.SLACK_WEBHOOK_URL),
    users: get('SELECT count(*) AS n FROM users').n,
    moments: get('SELECT count(*) AS n FROM moments').n
  })
};
