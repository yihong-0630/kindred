// The Happiness API. The finance metaphor is the architecture, not decoration.
//
//   Currency   meaningful moments
//   Balance    decayed sum of recent meaning ("happiness capital")
//   Interest   compounding from consecutive days of ritual
//   Investment rituals that cost energy now and pay meaning later
//   Risk       autopilot, isolation, burnout
//   Portfolio  the mix of solo / social / physical / reflective
//   Audit      the weekly statement

import { all } from './db.js';
import { KIND_TO_PERMA, PERMA } from './rituals.js';

const DAY = 86400000;
const HALF_LIFE_DAYS = 3.5;
export const KINDS = ['solo', 'social', 'physical', 'reflective'];

export const dayKey = (iso) => new Date(iso).toISOString().slice(0, 10);
const daysAgo = (iso, now) => (now - new Date(iso).getTime()) / DAY;

export function momentsFor(userId, days = 30) {
  const since = new Date(Date.now() - days * DAY).toISOString();
  return all('SELECT * FROM moments WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC', userId, since);
}

/** Decayed "happiness capital": recent meaning counts more, nothing is ever erased. */
export function balanceOf(moments, now = Date.now()) {
  return moments.reduce((sum, m) => sum + m.meaning * Math.pow(0.5, daysAgo(m.created_at, now) / HALF_LIFE_DAYS), 0);
}

/** Consecutive days ending today (or yesterday) with at least one ritual. */
export function streakOf(moments, now = Date.now()) {
  const days = new Set(moments.map((m) => dayKey(m.created_at)));
  let streak = 0;
  let cursor = new Date(now);
  if (!days.has(cursor.toISOString().slice(0, 10))) cursor = new Date(now - DAY);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY);
  }
  return streak;
}

/** Compounding: a ritual practice pays a rate, a one-off does not. */
export function interestOf(balance, streak) {
  const rate = Math.min(streak * 0.015, 0.2);
  return { rate, earned: balance * rate, streak };
}

export function portfolioOf(moments) {
  const totals = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const m of moments) totals[m.kind] = (totals[m.kind] || 0) + m.meaning;
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const weights = Object.fromEntries(KINDS.map((k) => [k, totals[k] / sum]));
  // Diversification = 1 - normalised Herfindahl. A portfolio of one ritual is fragile.
  const hhi = Object.values(weights).reduce((a, w) => a + w * w, 0);
  const diversification = Math.max(0, (1 - hhi) / (1 - 1 / KINDS.length));
  return { totals, weights, diversification };
}

/** Risk is the absence of things, not the presence of them. */
export function riskOf(moments, now = Date.now()) {
  const last7 = moments.filter((m) => daysAgo(m.created_at, now) <= 7);
  const socialDays = new Set(last7.filter((m) => m.kind === 'social' || m.company === 'with').map((m) => dayKey(m.created_at)));
  const activeDays = new Set(last7.map((m) => dayKey(m.created_at)));
  const isolation = Math.max(0, 1 - Math.min(7, socialDays.size) / 7);
  const autopilot = Math.max(0, 1 - Math.min(7, activeDays.size) / 7);
  const moods = last7.map((m) => m.mood);
  const moodDrag = moods.length ? Math.max(0, (3.2 - moods.reduce((a, b) => a + b, 0) / moods.length) / 2.2) : 0.5;
  const score = Math.max(0, Math.min(1, isolation * 0.4 + autopilot * 0.35 + moodDrag * 0.25));
  const level = score < 0.25 ? 'low' : score < 0.45 ? 'moderate' : score < 0.68 ? 'elevated' : 'high';
  const drivers = [];
  if (isolation > 0.5) drivers.push('isolation — most days this week had no shared ritual');
  if (autopilot > 0.45) drivers.push('autopilot — whole days passed without a marked moment');
  if (moodDrag > 0.4) drivers.push('low mood carrying across days');
  if (!drivers.length) drivers.push('nothing structural — the week has shape');
  return { score, level, isolation, autopilot, drivers };
}

export function permaOf(moments) {
  const scores = Object.fromEntries(PERMA.map((p) => [p, 0]));
  for (const m of moments) {
    const map = KIND_TO_PERMA[m.kind] || {};
    for (const [block, w] of Object.entries(map)) scores[block] += m.meaning * w;
  }
  const max = Math.max(1, ...Object.values(scores));
  // Economic security has no ritual that feeds it — say so rather than drawing a
  // zero bar that reads like a person scoring nothing on it.
  return PERMA.map((block) => ({
    block,
    raw: scores[block],
    score: Math.round((scores[block] / max) * 100),
    measured: scores[block] > 0
  }));
}

/** Daily meaning series for the sparkline / statement. */
export function seriesOf(moments, days = 14, now = Date.now()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * DAY).toISOString().slice(0, 10);
    const day = moments.filter((m) => dayKey(m.created_at) === d);
    out.push({ date: d, meaning: +day.reduce((a, m) => a + m.meaning, 0).toFixed(2), count: day.length });
  }
  return out;
}

/**
 * Pattern finding — this is the "processing" half of the Happiness API.
 * Compares days that contain a ritual against days that do not.
 */
export function insightsOf(moments, now = Date.now()) {
  const byDay = new Map();
  for (const m of moments) {
    const d = dayKey(m.created_at);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(m);
  }
  const days = [...byDay.entries()].map(([date, ms]) => ({
    date,
    ms,
    good: ms.reduce((a, m) => a + m.mood, 0) / ms.length >= 3.6,
    keys: new Set(ms.map((m) => m.ritual_key)),
    kinds: new Set(ms.map((m) => m.kind))
  }));
  if (days.length < 4) return [];

  const tests = [
    { id: 'morning_talk', label: 'one conversation before 10am', has: (d) => d.keys.has('morning_talk') },
    { id: 'social',       label: 'any shared ritual',            has: (d) => d.kinds.has('social') },
    { id: 'walk',         label: 'a walk outside',               has: (d) => d.keys.has('walk') },
    { id: 'boundary',     label: 'a closed focus block',         has: (d) => d.keys.has('focus_close') },
    { id: 'evening',      label: 'an evening wind-down',         has: (d) => d.keys.has('evening_wind') }
  ];

  const out = [];
  for (const t of tests) {
    const withIt = days.filter(t.has);
    const without = days.filter((d) => !t.has(d));
    if (withIt.length < 2 || without.length < 2) continue;
    const pWith = withIt.filter((d) => d.good).length / withIt.length;
    const pWithout = without.filter((d) => d.good).length / without.length;
    // Capped: with a three-week ledger, anything above 5x is an artefact of a
    // small denominator, not a finding worth showing a human.
    const lift = Math.min(5, pWithout === 0 ? pWith / 0.12 : pWith / pWithout);
    if (lift < 1.25) continue; // below this it is noise, not a pattern
    out.push({
      id: t.id,
      label: t.label,
      lift: +lift.toFixed(1),
      pWith: Math.round(pWith * 100),
      pWithout: Math.round(pWithout * 100),
      sample: withIt.length + without.length,
      text: `You are ${lift.toFixed(1)}x more likely to report a good day when it includes ${t.label}.`
    });
  }
  return out.sort((a, b) => b.lift - a.lift).slice(0, 3);
}

/** The whole personal ledger in one object — what /api/ledger returns. */
export function ledgerFor(user, days = 30) {
  const moments = momentsFor(user.id, days);
  const now = Date.now();
  const balance = balanceOf(moments, now);
  const streak = streakOf(moments, now);
  const interest = interestOf(balance, streak);
  const invested = moments.filter((m) => m.invested).reduce((a, m) => a + m.meaning, 0);
  const week = moments.filter((m) => daysAgo(m.created_at, now) <= 7);
  const prevWeek = moments.filter((m) => daysAgo(m.created_at, now) > 7 && daysAgo(m.created_at, now) <= 14);
  return {
    user: { id: user.id, name: user.name, avatar: user.avatar, role: user.role },
    balance: +balance.toFixed(1),
    currency: +moments.reduce((a, m) => a + m.meaning, 0).toFixed(1),
    interest: { rate: +(interest.rate * 100).toFixed(1), earned: +interest.earned.toFixed(1), streak },
    investment: +invested.toFixed(1),
    risk: riskOf(moments, now),
    portfolio: portfolioOf(moments),
    perma: permaOf(moments),
    series: seriesOf(moments, 14, now),
    insights: insightsOf(moments, now),
    week: { count: week.length, meaning: +week.reduce((a, m) => a + m.meaning, 0).toFixed(1) },
    prevWeek: { count: prevWeek.length, meaning: +prevWeek.reduce((a, m) => a + m.meaning, 0).toFixed(1) },
    moments: moments.slice(0, 40)
  };
}
