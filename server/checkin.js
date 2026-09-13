// The morning conversation.
//
// Kindred opens on a chat, not a form. Four to five questions, answered by
// typing, tapping a chip, or speaking. Every answer is stored verbatim in
// checkin_answers; what the agent infers from them is stored separately on the
// checkin row, so the log stays a record of what the person actually said.

import { all, get, run } from './db.js';
import { BY_KEY } from './rituals.js';

export const localDay = (offsetMinutes = 0) => {
  const d = new Date(Date.now() - offsetMinutes * 60000);
  return d.toISOString().slice(0, 10);
};

const now = () => new Date().toISOString();

// ------------------------------------------------------------------ questions
//
// Q1 and Q2 are always asked. Q3 branches on how Q1 landed. Q4 and Q5 are drawn
// from the remaining pool, so the conversation is 4-5 turns and does not read
// like the same form every morning.

const OPENERS = [
  'Hey. How are you feeling this morning?',
  'Hey, how are you feeling?',
  'Morning. How are you feeling today?'
];

export const QUESTIONS = {
  feeling: {
    key: 'feeling', always: true,
    text: () => OPENERS[new Date().getDate() % OPENERS.length],
    // The greeting the browser speaks aloud on first launch of the day.
    spoken: 'Hey, how are you feeling?',
    chips: ['Pretty good', 'Fine, I think', 'Flat', 'Tired', 'Wired', 'Rough morning']
  },
  energy: {
    key: 'energy', always: true,
    text: () => 'Where is your energy sitting — wired, steady, or flat?',
    chips: ['Wired', 'Steady', 'Flat', 'Somewhere in between']
  },
  weight: {
    key: 'weight', when: (s) => s.mood <= 2,
    text: () => 'What is taking up the most room in your head right now?',
    chips: ['Work', 'A person', 'Sleep', 'Nothing I can name']
  },
  lift: {
    key: 'lift', when: (s) => s.mood >= 4,
    text: () => 'What is behind the good one? Worth knowing what works.',
    chips: ['Slept well', 'Something went right', 'Saw someone', 'No idea']
  },
  middle: {
    key: 'middle', when: (s) => s.mood === 3,
    text: () => 'What would tip today one way or the other?',
    chips: ['Getting one thing done', 'Seeing someone', 'A quiet hour', 'Fresh air']
  },
  appetite: {
    key: 'appetite', pool: true,
    text: () => 'What do you actually feel like doing today?',
    chips: ['Something with people', 'Something alone', 'Move my body', 'As little as possible']
  },
  company: {
    key: 'company', pool: true,
    text: () => 'Do you want people around today, or space?',
    chips: ['People', 'Space', 'One person, not a room']
  },
  small: {
    key: 'small', pool: true,
    text: () => 'One small thing that would make today count. What is it?',
    chips: ['A walk', 'A real conversation', 'Finishing one thing', 'An early night']
  }
};

/** Build the script for this check-in: always-on questions, one branch, then pool. */
export function planQuestions(signals = { mood: 3 }) {
  const script = [QUESTIONS.feeling, QUESTIONS.energy];
  const branch = [QUESTIONS.weight, QUESTIONS.lift, QUESTIONS.middle].find((q) => q.when(signals));
  if (branch) script.push(branch);
  const pool = [QUESTIONS.appetite, QUESTIONS.company, QUESTIONS.small];
  // Rotate the tail so consecutive mornings do not repeat verbatim.
  const offset = new Date().getDate() % pool.length;
  script.push(pool[offset], pool[(offset + 1) % pool.length]);
  return script.slice(0, 5);
}

// -------------------------------------------------------------------- reading
//
// A deliberately small, inspectable lexicon. This runs with no network and no
// model; when OPENROUTER_API_KEY is set the agent writes the summary line on top of
// these same signals rather than replacing them.

const LEX = {
  mood: [
    [-2, ['awful', 'terrible', 'horrible', 'rough', 'miserable', 'worst', 'dreading', 'hopeless', 'crying', 'broken']],
    [-1, ['flat', 'tired', 'exhausted', 'drained', 'meh', 'low', 'sad', 'down', 'heavy', 'numb', 'blah', 'off', 'shattered', 'knackered', 'bad', 'struggling']],
    [0,  ['fine', 'ok', 'okay', 'alright', 'normal', 'same', 'average', 'neutral', 'in between', 'so so']],
    [1,  ['good', 'decent', 'better', 'calm', 'steady', 'settled', 'content', 'rested', 'clear']],
    [2,  ['great', 'brilliant', 'excellent', 'amazing', 'happy', 'energised', 'energized', 'buzzing', 'excited', 'wonderful', 'fantastic', 'lovely']]
  ],
  themes: {
    anxious:     ['anxious', 'anxiety', 'nervous', 'worried', 'worry', 'panic', 'dread', 'on edge', 'racing', 'spiral', 'stressed', 'stress'],
    overwhelmed: ['overwhelm', 'too much', 'swamped', 'buried', 'behind', 'drowning', 'no time', 'busy', 'deadline', 'backlog', 'pressure'],
    lonely:      ['lonely', 'alone', 'isolated', 'nobody', 'no one', 'disconnected', 'miss',
                  'spoken to anyone', 'talked to anyone', 'spoke to anyone', 'seen anyone',
                  'by myself', 'on my own', 'no-one'],
    sleep:       ['sleep', 'slept', 'insomnia', 'awake', 'tired', 'exhausted', 'bed', 'rest', 'nap', 'knackered'],
    body:        ['sore', 'stiff', 'sick', 'ill', 'headache', 'pain', 'ache', 'unwell', 'hungover'],
    focus:       ['focus', 'distract', 'scattered', 'concentrat', 'procrastinat', 'unfocused'],
    screen:      ['screen', 'laptop', 'phone', 'scrolling', 'email', 'inbox', 'slack', 'meetings', 'zoom', 'calls'],
    gratitude:   ['grateful', 'thankful', 'lucky', 'glad', 'appreciate'],
    outdoors:    ['outside', 'walk', 'air', 'park', 'sun', 'nature', 'garden', 'run'],
    meaning:     ['pointless', 'meaning', 'purpose', 'why', 'matters', 'stuck', 'drifting'],
    // The body is talking rather than the thoughts — route to somatic actions.
    somatic:     ['tense', 'tight', 'shaky', 'jittery', 'clenched', 'chest', 'stomach', 'shoulders', 'jaw', 'breathe', 'breathing', 'racing heart', 'numb', 'frozen', 'dissociat', 'out of it', 'not in my body'],
    // The room is the problem — route to environmental actions.
    environment: ['room', 'desk', 'office', 'stuffy', 'cluttered', 'mess', 'messy', 'noise', 'noisy', 'loud', 'dark', 'cold', 'hot', 'cramped', 'same four walls', 'indoors', 'stuck inside']
  },
  energy: {
    wired:  ['wired', 'restless', 'jittery', 'buzzing', 'anxious', 'racing', 'amped', 'keyed up', 'on edge'],
    flat:   ['flat', 'tired', 'exhausted', 'drained', 'sluggish', 'heavy', 'low', 'nothing left', 'empty', 'knackered'],
    steady: ['steady', 'fine', 'ok', 'okay', 'normal', 'balanced', 'even', 'calm', 'good']
  },
  social: {
    toward: ['people', 'someone', 'friend', 'talk', 'together', 'company', 'colleague', 'team', 'lunch', 'coffee with', 'call'],
    away:   ['alone', 'space', 'quiet', 'solo', 'by myself', 'on my own', 'nobody', 'no one', 'left alone', 'as little as possible']
  }
};

const hits = (text, words) => words.filter((w) => text.includes(w)).length;

const POSITIVES = 'good|great|ok|okay|fine|well|amazing|brilliant|happy|rested|calm|better';
const NEGATORS = "not|n't|isn't|wasn't|aren't|don't|didn't|never|no|nothing|hardly|barely";

/**
 * "not great" is not a hit for "great". Rewrite negated positives to a single
 * negative token before the lexicon ever sees them, so one phrase scores once.
 */
const NEGATIVES = 'bad|awful|terrible|rough|horrible';
const HEDGE = '(?:really\\s+|very\\s+|that\\s+|been\\s+|so\\s+|too\\s+|feeling\\s+)?';

const denegate = (text) => text
  .replace(new RegExp(`\\b(?:${NEGATORS})\\s+${HEDGE}(?:${POSITIVES})\\b`, 'g'), ' bad ')
  .replace(new RegExp(`\\b(?:${NEGATORS})\\s+${HEDGE}(?:${NEGATIVES})\\b`, 'g'), ' ok ');

/**
 * Read structured signals out of the raw answers. Deterministic and local —
 * the same text always produces the same signals, which is what makes the
 * stored log auditable.
 */
export function readSignals(answers) {
  const joined = denegate(answers.map((a) => a.answer).join(' · ').toLowerCase());
  const first = denegate((answers.find((a) => a.question_key === 'feeling')?.answer || '').toLowerCase());
  // The energy answer is about arousal, not valence. "Flat" there is an answer
  // to the question asked, and must not drag the mood score down on its own.
  const restRaw = answers
    .filter((a) => a.question_key !== 'feeling' && a.question_key !== 'energy')
    .map((a) => a.answer).join(' · ').toLowerCase();
  const rest = denegate(restRaw);

  // Mood comes from the question that asked about mood. Everything else is
  // corroborating evidence at roughly a third of the weight.
  let score = 0, seen = 0;
  for (const [weight, words] of LEX.mood) {
    const inFirst = hits(first, words);
    const inRest = hits(rest, words);
    score += weight * (inFirst + inRest * 0.35);
    seen += inFirst + inRest * 0.35;
  }
  const mood = seen === 0
    ? 3
    : Math.max(1, Math.min(5, Math.round(3 + score / Math.max(1, Math.sqrt(seen)))));

  const energyScores = Object.entries(LEX.energy).map(([k, words]) => [k, hits(joined, words)]);
  const topEnergy = energyScores.sort((a, b) => b[1] - a[1])[0];
  const energy = topEnergy[1] > 0 ? topEnergy[0] : mood <= 2 ? 'flat' : 'steady';

  const toward = hits(joined, LEX.social.toward);
  const away = hits(joined, LEX.social.away);
  const social = toward === away ? 'neutral' : toward > away ? 'toward' : 'away';

  const themes = Object.entries(LEX.themes)
    .map(([theme, words]) => [theme, hits(joined, words)])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([theme]) => theme)
    .slice(0, 4);

  if (mood <= 2 && !themes.includes('low_mood')) themes.unshift('low_mood');

  const intent = answers.find((a) => ['appetite', 'small', 'company'].includes(a.question_key))?.answer || null;
  return { mood, energy, social, themes, intent };
}

/** Signals expressed as practice tags, for matching. */
export function signalTags(s) {
  const tags = new Set(s.themes);
  tags.add(s.energy);
  if (s.mood <= 2) tags.add('low_mood');
  if (s.mood >= 4) tags.add('good_mood');
  if (s.social === 'toward') tags.add('social');
  if (s.social === 'away') tags.add('solo');
  const hour = new Date().getHours();
  tags.add(hour < 12 ? 'morning' : hour >= 18 ? 'evening' : 'steady');
  return tags;
}

// ------------------------------------------------------------------ storage

export function todaysCheckin(userId) {
  return get('SELECT * FROM checkins WHERE user_id = ? AND day = ?', userId, localDay());
}

export function openCheckin(userId, day = localDay()) {
  const existing = get('SELECT * FROM checkins WHERE user_id = ? AND day = ?', userId, day);
  if (existing) return existing;
  run('INSERT INTO checkins (user_id, day, themes, created_at) VALUES (?,?,?,?)', userId, day, '', now());
  return get('SELECT * FROM checkins WHERE user_id = ? AND day = ?', userId, day);
}

export function answersFor(checkinId) {
  return all('SELECT * FROM checkin_answers WHERE checkin_id = ? ORDER BY seq', checkinId);
}

export function recordAnswer(checkinId, { questionKey, question, answer, modality }) {
  const seq = (get('SELECT count(*) AS n FROM checkin_answers WHERE checkin_id = ?', checkinId).n) + 1;
  run(`INSERT INTO checkin_answers (checkin_id, seq, question_key, question, answer, modality, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    checkinId, seq, questionKey, question, String(answer).slice(0, 2000),
    ['voice', 'choice', 'text'].includes(modality) ? modality : 'text', now());
  if (modality === 'voice') run('UPDATE checkins SET voice = 1 WHERE id = ?', checkinId);
  return seq;
}

export function finishCheckin(checkinId, signals, summary) {
  run(`UPDATE checkins SET mood = ?, energy = ?, social = ?, themes = ?, intent = ?, summary = ?, completed = 1 WHERE id = ?`,
    signals.mood, signals.energy, signals.social, signals.themes.join(','), signals.intent, summary, checkinId);
  return get('SELECT * FROM checkins WHERE id = ?', checkinId);
}

/** The agent's local read-back line. Replaced by the model when a key is set. */
export function localSummary(signals, name) {
  const who = name ? name.split(' ')[0] : 'you';
  const energy = { flat: 'running flat', wired: 'running hot', steady: 'holding steady' }[signals.energy];
  const lean = signals.social === 'toward' ? 'and you want people near you'
    : signals.social === 'away' ? 'and you want the room to yourself'
    : 'and you have not decided about company yet';
  // On a good morning, naming a "theme" turns an observation into a diagnosis.
  // Only surface it when the person is actually reporting a hard day.
  const theme = signals.mood <= 3 ? signals.themes.find((t) => t !== 'low_mood') : null;
  const NAMED = {
    somatic: 'your body', environment: 'the room you are in', sleep: 'sleep',
    anxious: 'anxiety', overwhelmed: 'how much there is', lonely: 'being on your own',
    focus: 'focus', screen: 'screens', body: 'your body', meaning: 'whether it matters',
    gratitude: 'something you were glad about'
  };
  const tail = theme ? ` What you kept coming back to was ${NAMED[theme] || theme.replace('_', ' ')}.` : '';
  return `${who} at ${signals.mood} out of 5, ${energy} ${lean}.${tail}`;
}

/** Recent check-ins, for the pattern view and for not repeating recommendations. */
export function recentCheckins(userId, days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return all('SELECT * FROM checkins WHERE user_id = ? AND day >= ? ORDER BY day DESC', userId, since);
}

export const ritualForPractice = (p) => (p.ritual_key && BY_KEY[p.ritual_key]) || null;
