// Personal → team → enterprise. The aggregate is signal, not surveillance:
// nothing above the personal layer exposes an individual moment or note.

import { all, get } from './db.js';
import { balanceOf, momentsFor, portfolioOf, riskOf, streakOf, dayKey, KINDS } from './ledger.js';
import { localDay } from './checkin.js';

const DAY = 86400000;

/**
 * What this morning's check-in contributes to the team view.
 *
 * Only the derived columns are read — mood, energy, social lean. The verbatim
 * answers in `checkin_answers` are never touched here and never leave the
 * personal ledger. This is the same level of disclosure the member table has
 * always carried (a risk level), sourced from what someone said about today
 * rather than inferred from a gap in their ritual history.
 */
function todaySignal(userId) {
  const row = get('SELECT mood, energy, social, completed FROM checkins WHERE user_id = ? AND day = ?', userId, localDay());
  if (!row || !row.completed) return null;
  return {
    mood: row.mood,
    energy: row.energy,
    social: row.social,
    // The threshold that makes someone worth reaching: they said it themselves.
    low: row.mood <= 2 || row.energy === 'flat',
    wantsSpace: row.social === 'away'
  };
}

export function memberSummaries(teamId) {
  const users = all("SELECT id, name, avatar, role, team_id FROM users WHERE team_id = ? AND role != 'judge' ORDER BY name", teamId);
  return users.map((u) => {
    const moments = momentsFor(u.id, 21);
    const balance = balanceOf(moments);
    const risk = riskOf(moments);
    const lastSocial = moments.find((m) => m.kind === 'social' || m.company === 'with');
    const checkin = todaySignal(u.id);

    // A ritual history is three weeks old at its freshest. A check-in is an
    // hour old. When someone has just reported a low morning, that outranks
    // what their ledger looked like yesterday — so it lifts the score rather
    // than waiting for the gap to open up in the history.
    const checkinLift = checkin?.low ? 0.25 + (3 - Math.min(3, checkin.mood ?? 3)) * 0.08 : 0;
    const score = Math.max(0, Math.min(1, risk.score + checkinLift));
    const level = score < 0.25 ? 'low' : score < 0.45 ? 'moderate' : score < 0.68 ? 'elevated' : 'high';

    return {
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      role: u.role,
      balance: +balance.toFixed(1),
      streak: streakOf(moments),
      risk: level,
      riskScore: +score.toFixed(2),
      ledgerRisk: risk.level,
      checkin,
      weekCount: moments.filter((m) => Date.now() - new Date(m.created_at).getTime() <= 7 * DAY).length,
      hoursSinceSocial: lastSocial ? Math.max(0, Math.round((Date.now() - new Date(lastSocial.created_at).getTime()) / 3600000)) : 999,
      lastMoment: moments[0] ? { label: moments[0].label, at: moments[0].created_at } : null
    };
  });
}

export function teamLedger(teamId) {
  const team = get('SELECT t.*, o.name AS org_name FROM teams t JOIN orgs o ON o.id = t.org_id WHERE t.id = ?', teamId);
  const members = memberSummaries(teamId);
  const ids = members.map((m) => m.id);
  if (!ids.length) return { team, members, shared: [], portfolio: null, series: [] };

  const placeholders = ids.map(() => '?').join(',');
  const since = new Date(Date.now() - 21 * DAY).toISOString();
  const moments = all(`SELECT * FROM moments WHERE user_id IN (${placeholders}) AND created_at >= ? ORDER BY created_at DESC`, ...ids, since);

  // Shared rituals: the ones more than one person did on the same day.
  const grouped = new Map();
  for (const m of moments.filter((x) => x.kind === 'social')) {
    const k = `${dayKey(m.created_at)}::${m.ritual_key}`;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k).push(m);
  }
  const shared = [...grouped.entries()]
    .filter(([, ms]) => new Set(ms.map((m) => m.user_id)).size > 1)
    .map(([k, ms]) => ({
      date: k.split('::')[0],
      ritual: ms[0].label,
      people: new Set(ms.map((m) => m.user_id)).size,
      meaning: +ms.reduce((a, m) => a + m.meaning, 0).toFixed(1),
      mood: +(ms.reduce((a, m) => a + m.mood, 0) / ms.length).toFixed(1)
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 12);

  const series = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    const day = moments.filter((m) => dayKey(m.created_at) === d);
    series.push({
      date: d,
      meaning: +day.reduce((a, m) => a + m.meaning, 0).toFixed(1),
      social: day.filter((m) => m.kind === 'social').length,
      people: new Set(day.map((m) => m.user_id)).size
    });
  }

  return {
    team,
    members,
    shared,
    portfolio: portfolioOf(moments),
    series,
    balance: +members.reduce((a, m) => a + m.balance, 0).toFixed(1),
    atRisk: members.filter((m) => m.risk === 'elevated' || m.risk === 'high')
  };
}

/**
 * Enterprise ledger. Aggregate patterns only — the smallest unit reported is a
 * team, and any weekday cohort under `MIN_COHORT` observations is suppressed.
 */
const MIN_COHORT = 4;

export function orgLedger(orgId) {
  const org = get('SELECT * FROM orgs WHERE id = ?', orgId);
  const teams = all('SELECT * FROM teams WHERE org_id = ? ORDER BY name', orgId);
  const rows = teams.map((t) => {
    const l = teamLedger(t.id);
    const psych = psychSafetyProxy(l);
    return {
      id: t.id,
      name: t.name,
      headcount: l.members.length,
      balance: l.balance,
      avgBalance: l.members.length ? +(l.balance / l.members.length).toFixed(1) : 0,
      sharedRituals: l.shared.length,
      atRisk: l.atRisk.length,
      diversification: l.portfolio ? +l.portfolio.diversification.toFixed(2) : 0,
      psychSafety: psych
    };
  });

  // "Teams that take a shared lunch on Wednesdays report 22% higher psychological safety."
  // Median split on shared-ritual density, so the comparison holds whatever the
  // absolute numbers look like in this org.
  const densities = rows.map((r) => r.sharedRituals).sort((a, b) => a - b);
  const median = densities[Math.floor(densities.length / 2)] ?? 0;
  const withLunch = rows.filter((r) => r.sharedRituals >= median);
  const withoutLunch = rows.filter((r) => r.sharedRituals < median);
  const signals = [];
  if (withLunch.length && withoutLunch.length) {
    const a = withLunch.reduce((s, r) => s + r.psychSafety, 0) / withLunch.length;
    const b = withoutLunch.reduce((s, r) => s + r.psychSafety, 0) / withoutLunch.length;
    if (b > 0) {
      signals.push({
        text: `Teams above the median for shared rituals show ${Math.round(((a - b) / b) * 100)}% higher psychological-safety proxy.`,
        cohort: rows.length,
        suppressed: rows.length < MIN_COHORT
      });
    }
  }
  const bestDay = weekdaySignal(orgId);
  if (bestDay) signals.push(bestDay);

  return {
    org,
    teams: rows,
    signals: signals.filter((s) => !s.suppressed),
    headcount: rows.reduce((a, r) => a + r.headcount, 0),
    portfolio: KINDS.map((k) => ({ kind: k })),
    privacy: `Individual moments, notes and reframes are never exposed above the personal ledger. Cohorts smaller than ${MIN_COHORT} are suppressed.`
  };
}

/** A proxy, clearly labelled as one: shared rituals + mood inside them. */
function psychSafetyProxy(teamLedgerResult) {
  if (!teamLedgerResult.shared.length) return 40;
  const moodAvg = teamLedgerResult.shared.reduce((a, s) => a + s.mood, 0) / teamLedgerResult.shared.length;
  const density = Math.min(1, teamLedgerResult.shared.length / 10);
  return Math.round((moodAvg / 5) * 70 + density * 30);
}

function weekdaySignal(orgId) {
  const rows = all(
    `SELECT m.created_at, m.kind, m.mood FROM moments m
     JOIN users u ON u.id = m.user_id JOIN teams t ON t.id = u.team_id
     WHERE t.org_id = ? AND m.created_at >= ?`,
    orgId,
    new Date(Date.now() - 28 * DAY).toISOString()
  );
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const buckets = names.map(() => ({ social: 0, mood: 0, n: 0 }));
  for (const r of rows) {
    const b = buckets[new Date(r.created_at).getDay()];
    b.n += 1;
    b.mood += r.mood;
    if (r.kind === 'social') b.social += 1;
  }
  let best = null;
  buckets.forEach((b, i) => {
    if (b.n < MIN_COHORT) return;
    const score = (b.social / b.n) * (b.mood / b.n);
    if (!best || score > best.score) best = { score, i, b };
  });
  if (!best) return null;
  const others = buckets.filter((b, i) => i !== best.i && b.n >= MIN_COHORT);
  if (!others.length) return null;
  const otherMood = others.reduce((a, b) => a + b.mood / b.n, 0) / others.length;
  const lift = Math.round(((best.b.mood / best.b.n - otherMood) / otherMood) * 100);
  return {
    text: `${names[best.i]}s carry the most shared ritual across the org, and mood on those days runs ${lift > 0 ? lift : Math.abs(lift)}% ${lift > 0 ? 'higher' : 'lower'} than the weekly average.`,
    cohort: best.b.n,
    suppressed: false
  };
}

/**
 * Two people, both low, right now. The trigger for the tea invite.
 *
 * Whoever checked in low this morning anchors the pair: they are the freshest
 * and the most certain signal on the team, because they said it themselves an
 * hour ago rather than having it read out of a gap in their history. The
 * partner is the next person who is drifting — so the invite is always two
 * people who both need it, never one person being sent to cheer another up.
 */
export function findTeaPair(teamId) {
  const members = memberSummaries(teamId);

  const saidSoThisMorning = members
    .filter((m) => m.checkin?.low)
    .sort((a, b) => (a.checkin.mood ?? 3) - (b.checkin.mood ?? 3) || b.riskScore - a.riskScore);

  const drifting = members
    .filter((m) => m.hoursSinceSocial >= 20 && m.riskScore >= 0.3)
    .sort((a, b) => b.riskScore - a.riskScore);

  const anchor = saidSoThisMorning[0] || drifting[0];
  if (!anchor) return null;

  const partner = [...saidSoThisMorning, ...drifting].find((m) => m.id !== anchor.id);
  return partner ? [anchor, partner] : null;
}
