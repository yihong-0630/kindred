// The brain. Everything here has a local, deterministic fallback so the demo
// never depends on a network call — if a model key is set the same prompts go
// to the model instead, and the response is labelled with which engine ran.
//
// The model is reached through OpenRouter, which speaks the OpenAI chat
// completions dialect, so one base URL and one key buy access to every model it
// fronts. `OPENROUTER_MODEL` takes a full slug — `openai/gpt-4o-mini`,
// `anthropic/claude-3.5-haiku`, `google/gemini-flash-1.5` — and switching
// providers is a one-line edit in .env with no code change.
//
// The older OPENAI_* names still work, so an existing .env keeps running: set
// OPENAI_BASE_URL yourself and you can still point straight at OpenAI.

import { BY_KEY, SENSES } from './rituals.js';

const KEY = () => process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
const MODEL = () => process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'openai/gpt-4o-mini';

const BASE = () => {
  const explicit = process.env.OPENROUTER_BASE_URL || process.env.OPENAI_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  // No base set: whichever key is present decides where the request goes.
  return process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1';
};

const viaOpenRouter = () => BASE().includes('openrouter.ai');

/** `openai` means a remote model answered; the DB enum predates OpenRouter. */
export const engineName = () => (KEY() ? 'openai' : 'local');

/** What to show a human: the actual model, not a hardcoded brand. */
export const modelName = () => (KEY() ? MODEL() : null);

const SYSTEM = `You are Kindred, a happiness accountant. You observe a person's daily rituals and
reframe ordinary moments as meaningful ones. You are not a coach and not a therapist — you are a
ritual-maker. Rules: one or two sentences, under 30 words. Second person. Concrete, never generic.
Name the specific thing they did. Never use the words "journey", "mindful", "wellness" or "self-care".
Never give advice with a verb like "try to". No emoji. No exclamation marks.`;

async function ask(prompt, fallback) {
  if (!KEY()) return { text: fallback, engine: 'local' };
  try {
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${KEY()}` };
    // OpenRouter's optional attribution headers. Harmless everywhere else, but
    // only sent where they mean something.
    if (viaOpenRouter()) {
      headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL || 'https://github.com/kindred-app';
      headers['X-Title'] = process.env.OPENROUTER_APP_NAME || 'Kindred';
    }

    const res = await fetch(`${BASE()}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MODEL(),
        temperature: 0.85,
        max_tokens: 90,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }]
      }),
      signal: AbortSignal.timeout(9000)
    });
    if (!res.ok) {
      // The body carries the real reason — a bad slug, no credit, a rate limit —
      // and silently falling back to the local engine hides all three.
      const detail = await res.text().catch(() => '');
      throw new Error(`${viaOpenRouter() ? 'openrouter' : 'openai'} ${res.status} ${detail.slice(0, 200)}`);
    }
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim();
    return text ? { text, engine: 'openai' } : { text: fallback, engine: 'local' };
  } catch (err) {
    // Never fatal: the local engine is always there. But say so once, or a
    // misconfigured key looks exactly like a working demo.
    console.warn('· model call failed, using local engine —', String(err.message || err));
    return { text: fallback, engine: 'local' };
  }
}

// ---------------------------------------------------------------- local engine

const REFRAMES = {
  quiet_coffee: [
    'Seven minutes of coffee with nobody asking anything of you. That is not a gap in the day, it is the floor of it.',
    'You drank it warm instead of forgetting it. Small, and the whole morning now has an edge to start from.'
  ],
  coffee_with: [
    'The coffee was the excuse. What you actually did was let someone interrupt you on purpose.',
    'You spent the cup on a person rather than a screen. That is the cheapest compounding asset you own.'
  ],
  morning_talk: [
    'One real exchange before the day closed over your head. Your good days almost always start like this.',
    'You spoke to someone before the work had a chance to speak first. The order matters more than the length.'
  ],
  walk: [
    'The rain is not ruining your walk. It is giving you permission to slow down.',
    'You moved through weather instead of past it. Your legs kept score even if nothing else did.'
  ],
  shared_lunch: [
    'You ate beside someone instead of above a keyboard. The meal was identical. The hour was not.',
    'Lunch became a table rather than a refuel. That is the difference between a day and a life.'
  ],
  tea_break: [
    'Five minutes and a kettle rearranged the afternoon. Nobody had to schedule it.',
    'The tea was incidental. The pause was the product.'
  ],
  focus_close: [
    'You closed the block instead of bleeding into the next one. The boundary is the ritual.',
    'This moment is complete. The next one has not started yet. You let that be true.'
  ],
  token_turn: [
    'You turned the token. No battery, no screen — just your own hand telling you the moment counted.',
    'The weight in your pocket did its only job: it reminded you that you are a person having a day.'
  ],
  evening_wind: [
    'Cedar, and the work stopped being in the room. You gave the evening a border it can hold.',
    'You marked the end instead of drifting over it. Your sleep tends to notice.'
  ],
  ambient_check: [
    'You looked at the ledger and not the inbox. A mirror that tells a kinder story is still a mirror.',
    'You checked your balance in meaning rather than minutes. Different currency, same discipline.'
  ],
  made_something: [
    'Hands busy, head quiet. Nothing on the calendar can reproduce that.',
    'You made a thing that exists now and did not before. Accomplishment is not always billable.'
  ],
  gratitude: [
    'You told them the specific reason. Specific beats nice, and it lands twice.',
    'You spent words you could have kept. That is an investment with an unusually short payback.'
  ]
};

const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];

function localReframe({ ritual, mood, streak, balance, lastSimilar }) {
  const bank = REFRAMES[ritual.key] || ['You marked the moment. That is the whole mechanism.'];
  const seed = Math.floor(Date.now() / 1000) + mood + streak;
  let text = pick(bank, seed);
  if (mood <= 2) text += ' It landed flat today, and it still counted.';
  else if (streak >= 4) text += ` ${streak} days running now — that is where the interest starts compounding.`;
  else if (lastSimilar) text += ` Last time you logged this your mood came out at ${lastSimilar}.`;
  return text;
}

// -------------------------------------------------------------------- exported

/** Reframe for a single logged moment. */
export async function reframeMoment(ctx) {
  const ritual = BY_KEY[ctx.ritualKey] || { key: ctx.ritualKey, label: ctx.ritualKey, kind: 'solo' };
  const fallback = localReframe({ ritual, mood: ctx.mood, streak: ctx.streak || 0, balance: ctx.balance || 0, lastSimilar: ctx.lastSimilar });
  const prompt = [
    `Ritual just logged: ${ritual.label} (${ritual.kind}, ${ctx.company === 'with' ? 'with someone' : 'alone'}).`,
    `Self-reported mood: ${ctx.mood}/5.`,
    ctx.note ? `They wrote: "${ctx.note}".` : null,
    `Their happiness balance is ${Math.round(ctx.balance || 0)} and they are on a ${ctx.streak || 0}-day ritual streak.`,
    ctx.insight ? `A pattern already in their ledger: ${ctx.insight}` : null,
    'Write the reframe.'
  ].filter(Boolean).join('\n');
  return ask(prompt, fallback);
}

/** The weekly audit: a statement, not a score. */
export async function weeklyStatement(ledger) {
  const top = ledger.insights[0]?.text || 'Your week had no single dominant pattern yet.';
  const delta = ledger.week.count - ledger.prevWeek.count;
  const fallback =
    `You had ${ledger.week.count} meaningful rituals this week and ${ledger.prevWeek.count} the week before. ` +
    `${delta >= 0 ? 'The practice is holding.' : 'It thinned out, and it is recoverable.'} ${top}`;
  const prompt = [
    `Weekly statement for ${ledger.user.name}.`,
    `Rituals this week: ${ledger.week.count} (${ledger.week.meaning} meaning). Last week: ${ledger.prevWeek.count}.`,
    `Balance ${Math.round(ledger.balance)}. Streak ${ledger.interest.streak} days at ${ledger.interest.rate}% interest.`,
    `Risk level: ${ledger.risk.level} — ${ledger.risk.drivers.join('; ')}.`,
    `Portfolio: ${Object.entries(ledger.portfolio.weights).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')}.`,
    `Strongest pattern: ${top}`,
    'Write the statement in 3 sentences. Read it like a bank statement written by someone who likes them.'
  ].join('\n');
  return ask(prompt, fallback);
}

/** Coffee matching: two people at a low point at the same time. */
/**
 * The one message the agent spends on the team.
 *
 * Each person gets a reason, and the reason is the *shape* of their signal —
 * "checked in low this morning", "has not shared a ritual in nine days" — never
 * a word of what they actually wrote. The verbatim check-in stays in the
 * personal ledger; the channel learns only that the morning was a low one.
 */
export async function teaInvite(a, b) {
  // Slack is a first-name room, and the reason reads as a sentence about a
  // person rather than a row out of a table.
  const first = (p) => p.name.split(' ')[0];
  const why = (p) => {
    if (p.checkin?.low) return 'checked in low this morning';
    const days = Math.floor((p.hoursSinceSocial ?? 0) / 24);
    if (days >= 2) return `has not shared a ritual in ${days} days`;
    return 'is running low';
  };

  // Somebody who asked for space this morning still gets the invite — but it
  // arrives as one person and an easy no, not as a summons.
  const wantsSpace = Boolean(a.checkin?.wantsSpace || b.checkin?.wantsSpace);
  const close = wantsSpace ? 'Five minutes, just the two of you, and it is fine to say no.' : 'Five minutes?';
  const fallback = `${first(a)} and ${first(b)} — ${first(a)} ${why(a)}, and ${first(b)} ${why(b)}. There is tea in the pantry. ${close}`;

  const prompt = [
    `Two teammates are both low right now. ${first(a)}: ${why(a)}, happiness balance ${Math.round(a.balance)}. ${first(b)}: ${why(b)}, happiness balance ${Math.round(b.balance)}.`,
    `Write one Slack message inviting both of them to a five-minute tea break. Use their first names, and give each of them their reason.`,
    wantsSpace ? 'One of them asked for space today, so make it explicitly easy to decline.' : '',
    'Under 30 words. No pressure, no emoji, no question about how they are feeling.'
  ].filter(Boolean).join('\n');

  return ask(prompt, fallback);
}

/** Ritual prompt the agent pushes when it sees a gap. */
export async function ritualPrompt(user, gap) {
  const fallback = gap.fallback;
  const prompt = `${user.name} has a gap in their day: ${gap.description}. Suggest one small ritual in one sentence, under 20 words.`;
  return ask(prompt, fallback);
}

/** What the agent asks the room to do when a ritual lands. */
export function actuationFor(ritualKey) {
  const r = BY_KEY[ritualKey];
  if (!r) return null;
  return { sense: r.sense, device: r.device, action: r.action, detail: SENSES[r.sense]?.line || '' };
}

// ------------------------------------------------------- the daily check-in

/**
 * The read-back at the end of the morning conversation. Local fallback is the
 * deterministic line from checkin.js; with a key the model writes it from the
 * same signals plus what the person actually said.
 */
export async function checkinSummary({ name, signals, answers, fallback }) {
  const said = answers.map((a) => `Q: ${a.question} / A: ${a.answer}`).join('\n');
  const prompt = [
    `${name} just finished their morning check-in.`,
    said,
    `Read of it: mood ${signals.mood}/5, energy ${signals.energy}, leaning ${signals.social} company.`,
    signals.themes.length ? `Themes: ${signals.themes.join(', ')}.` : null,
    'Reflect back what you heard in two sentences. Do not advise, do not reassure, do not ask a question. Name the specific thing they said.'
  ].filter(Boolean).join('\n');
  return ask(prompt, fallback);
}

/** One line on why this particular action, for this person, this morning. */
export async function recommendationNote({ name, signals, practice, fallback }) {
  const prompt = [
    `${name} is at mood ${signals.mood}/5 with ${signals.energy} energy${signals.themes.length ? `, and named: ${signals.themes.join(', ')}` : ''}.`,
    `Kindred is about to recommend: "${practice.action}"`,
    `The evidence behind it: ${practice.rationale} (${practice.source_publisher}).`,
    'Write one sentence, under 20 words, saying why this one, today. Do not restate the action.'
  ].join('\n');
  return ask(prompt, fallback);
}
