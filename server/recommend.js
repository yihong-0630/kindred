// Turning a check-in into three recommended actions.
//
// The ranking is deliberately readable: every term is a sentence you could say
// to the person. Nothing is recommended without a source row behind it, and the
// reason string names which signal earned it a place.

import { all, get, run } from './db.js';
import { signalTags } from './checkin.js';
import { BY_KEY } from './rituals.js';
import { sourcesFor } from './research.js';

const now = () => new Date().toISOString();

// Most specific last: a theme someone actually described beats a mood score.
const SPECIFICITY = ['flat', 'wired', 'low_mood', 'good_mood', 'grounding', 'focus',
  'screen', 'sleep', 'body', 'gratitude', 'meaning', 'anxious', 'overwhelmed',
  'lonely', 'somatic', 'environment'];

// Bare noun phrases: the sentence template supplies the verb, so the reason
// never reads "you named the sleep you mentioned".
const THEME_LABEL = {
  low_mood: 'a rough morning', anxious: 'anxiety', overwhelmed: 'being swamped',
  lonely: 'feeling disconnected', sleep: 'sleep', focus: 'trouble focusing',
  screen: 'a screen-heavy day', body: 'how your body feels',
  gratitude: 'something you were glad about', meaning: 'things feeling pointless',
  flat: 'flat energy', wired: 'running hot', good_mood: 'a good start',
  somatic: 'feeling it in your body', environment: 'the room you are in',
  grounding: 'needing to land somewhere'
};

/** Practices ranked for this person, this morning. */
export function recommendFor({ user, signals, ledger, limit = 3 }) {
  const tags = signalTags(signals);
  const pool = all("SELECT * FROM practices WHERE link_status != 'dead'");
  if (!pool.length) return [];

  // Which ritual kinds is their ledger thin on? A recommendation that fills a
  // gap is worth more than one that deepens a groove.
  const weights = ledger?.portfolio?.weights || {};
  const thin = Object.entries(weights).filter(([, w]) => w < 0.18).map(([k]) => k);
  const isolated = (ledger?.risk?.isolation ?? 0) > 0.5;
  const autopilot = (ledger?.risk?.autopilot ?? 0) > 0.45;

  // Do not repeat what we suggested in the last five days.
  const since = new Date(Date.now() - 5 * 86400000).toISOString();
  const recent = new Set(all(
    'SELECT practice_id FROM recommendations WHERE user_id = ? AND created_at >= ?', user.id, since
  ).map((r) => r.practice_id));

  const scored = pool.map((p) => {
    const ptags = p.tags.split(',').map((t) => t.trim()).filter(Boolean);
    const matched = ptags.filter((t) => tags.has(t));

    let score = matched.length * 3;
    // Ranked most-specific first, so the explanation names the distinctive
    // thing they said rather than whichever tag happened to sort first.
    const explains = matched
      .filter((t) => THEME_LABEL[t])
      .sort((a, b) => SPECIFICITY.indexOf(b) - SPECIFICITY.indexOf(a));

    score += p.credibility * 2;

    const fillsGap = thin.includes(p.kind);
    if (fillsGap) score += 1.5;
    if (isolated && p.kind === 'social') score += 2;
    if (autopilot && p.minutes <= 10) score += 1;

    // Low energy should not be handed a thirty-minute assignment.
    if (signals.energy === 'flat' && p.minutes <= 10) score += 1.2;
    if (signals.energy === 'flat' && p.minutes >= 20) score -= 1.2;
    if (signals.energy === 'wired' && ptags.includes('breath')) score += 1.5;

    // When someone reports it in the body, or names the room, bottom-up beats
    // anything that asks them to think their way out of it first.
    if (signals.themes.includes('somatic') && ptags.includes('somatic')) score += 2.5;
    if (signals.themes.includes('environment') && ptags.includes('environment')) score += 2.5;
    if ((signals.energy === 'wired' || signals.themes.includes('anxious')) && ptags.includes('grounding')) score += 1.8;

    // Respect what they said about company, rather than overriding it.
    if (signals.social === 'away' && p.kind === 'social') score -= 2.5;
    if (signals.social === 'toward' && p.kind === 'social') score += 1.5;

    if (recent.has(p.id)) score -= 4;

    return { practice: p, score, matched, explains, fillsGap, isolated: isolated && p.kind === 'social' };
  });

  const ranked = scored.sort((a, b) => b.score - a.score);

  // Three variations on sitting still is not a set of options. Prefer one per
  // ritual kind, then backfill from what is left if that runs short.
  const chosen = [];
  const kinds = new Set();
  for (const c of ranked) {
    if (chosen.length >= limit) break;
    if (kinds.has(c.practice.kind)) continue;
    chosen.push(c);
    kinds.add(c.practice.kind);
  }
  for (const c of ranked) {
    if (chosen.length >= limit) break;
    if (!chosen.includes(c)) chosen.push(c);
  }

  // Three cards that all say "because you named running hot" read like one
  // card printed three times. Each reason names a signal the others did not.
  const spent = new Set();
  return chosen.map((c, i) => ({
    ...withSources(c.practice),
    rank: i + 1,
    ritual: c.practice.ritual_key ? BY_KEY[c.practice.ritual_key] || null : null,
    reason: reasonFor(c, spent, signals)
  }));
}

/** One sentence, naming a signal no other card has claimed yet. */
function reasonFor(candidate, spent, signals) {
  const fresh = candidate.explains.find((t) => !spent.has(t));
  if (fresh) {
    spent.add(fresh);
    return `Because you mentioned ${THEME_LABEL[fresh]}.`;
  }
  if (candidate.isolated && !spent.has('isolation')) {
    spent.add('isolation');
    return 'Because most days this week had no shared ritual.';
  }
  if (candidate.fillsGap && !spent.has(`gap:${candidate.practice.kind}`)) {
    spent.add(`gap:${candidate.practice.kind}`);
    return `Because your ledger is thin on ${candidate.practice.kind} rituals.`;
  }
  const used = candidate.explains[0];
  if (used) return `Another angle on ${THEME_LABEL[used]} — ${candidate.practice.minutes} minutes.`;
  return `A ${candidate.practice.minutes}-minute ${candidate.practice.kind} action for where today is sitting.`;
}

/** Persist what was recommended, so acceptance can be measured later. */
export function saveRecommendations(userId, checkinId, picks) {
  for (const p of picks) {
    run(`INSERT INTO recommendations (user_id, checkin_id, practice_id, rank, reason, created_at)
         VALUES (?,?,?,?,?,?)`, userId, checkinId, p.id, p.rank, p.reason, now());
  }
  return all('SELECT * FROM recommendations WHERE checkin_id = ? ORDER BY rank', checkinId);
}

export function recommendationsFor(checkinId) {
  const rows = all(`SELECT p.*, r.id AS recommendation_id, r.rank AS rank, r.reason AS reason,
                           r.accepted AS accepted, r.moment_id AS moment_id
                    FROM recommendations r JOIN practices p ON p.id = r.practice_id
                    WHERE r.checkin_id = ? ORDER BY r.rank`, checkinId);
  return rows.map(withSources);
}

/**
 * A practice usually rests on two citations doing different jobs: the primary
 * study proves it, the readable write-up is the one a person will open. Send
 * both, ordered so the legible one leads.
 */
export function withSources(practice) {
  const sources = sourcesFor(practice.id).filter((s) => s.link_status !== 'dead');
  const readable = sources.find((s) => s.role === 'readable');
  const primary = sources.find((s) => s.role === 'primary');
  return {
    ...practice,
    sources,
    // What the card shows first, and what it shows as the proof underneath.
    lead: readable || primary || {
      role: 'primary', title: practice.source_title, publisher: practice.source_publisher,
      url: practice.source_url, evidence: practice.evidence, credibility: practice.credibility,
      snippet: practice.snippet, published: practice.source_date
    },
    evidenceSource: primary && (!readable || primary.url !== readable.url) ? primary : null
  };
}

/** Mark a recommendation taken, optionally tying it to the ledger entry it produced. */
export function acceptRecommendation(id, userId, momentId = null) {
  const rec = get('SELECT * FROM recommendations WHERE id = ? AND user_id = ?', id, userId);
  if (!rec) return null;
  run('UPDATE recommendations SET accepted = 1, moment_id = ? WHERE id = ?', momentId, id);
  return get('SELECT * FROM recommendations WHERE id = ?', id);
}

/** Uptake, for the dashboard: are the evidence-backed suggestions being taken? */
export function uptakeFor(userId, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = all('SELECT accepted FROM recommendations WHERE user_id = ? AND created_at >= ?', userId, since);
  const taken = rows.filter((r) => r.accepted === 1).length;
  return { offered: rows.length, taken, rate: rows.length ? +(taken / rows.length).toFixed(2) : 0 };
}
