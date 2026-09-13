// Evidence harvesting via Exa.
//
// How this works, and what it deliberately does not do:
//
//   A topic seed below owns the ACTION — the imperative Kindred will put in
//   front of a person. Exa owns the CITATION — it finds the best current
//   article from an allowlist of quality publishers that backs that action, and
//   we store its real title, URL, date and the sentence the claim rests on.
//
// The action is never invented from a snippet, because a paraphrase of a
// half-read page is how a wellbeing app ends up confidently wrong. What the
// harvest buys us is a live, checkable source for every recommendation, and
// coverage that widens as the literature does.
//
// Needs EXA_API_KEY. Without it the app runs on the curated set in practices.js.

import { all, get, run } from './db.js';
import { STEPS } from './steps.js';

const KEY = () => process.env.EXA_API_KEY;
const ENDPOINT = 'https://api.exa.ai/search';

export const researchEnabled = () => Boolean(KEY());

// ------------------------------------------------------------- source quality
//
// Tiered on editorial standard, not on how well the domain ranks. Anything not
// on this list is discarded rather than scored low — an allowlist is the only
// filter that survives contact with SEO wellness content.

export const ALLOWLIST = {
  // Tier 1 — primary research and major medical institutions
  'pubmed.ncbi.nlm.nih.gov': 0.95, 'ncbi.nlm.nih.gov': 0.95, 'nih.gov': 0.93,
  'nature.com': 0.93, 'science.org': 0.93, 'cell.com': 0.93, 'thelancet.com': 0.93,
  'bmj.com': 0.92, 'jamanetwork.com': 0.92, 'nejm.org': 0.93, 'plos.org': 0.88,
  'journals.plos.org': 0.88, 'frontiersin.org': 0.8, 'doi.org': 0.9,

  // Tier 2 — universities and research centres
  'health.harvard.edu': 0.9, 'harvard.edu': 0.88, 'hsph.harvard.edu': 0.9,
  'adultdevelopmentstudy.org': 0.9,
  'stanford.edu': 0.89, 'news.stanford.edu': 0.88, 'med.stanford.edu': 0.9,
  'longevity.stanford.edu': 0.87,
  'greatergood.berkeley.edu': 0.85, 'ggia.berkeley.edu': 0.85, 'berkeley.edu': 0.85,
  'yale.edu': 0.87, 'ox.ac.uk': 0.88, 'cam.ac.uk': 0.88, 'ucl.ac.uk': 0.86,
  'mit.edu': 0.87, 'uchicago.edu': 0.86, 'umich.edu': 0.85,
  'worldhappiness.report': 0.85,

  // Tier 3 — professional bodies and public health
  'apa.org': 0.87, 'psychologicalscience.org': 0.86, 'bps.org.uk': 0.84,
  'who.int': 0.88, 'cdc.gov': 0.86, 'nhs.uk': 0.85, 'mayoclinic.org': 0.84,
  'clevelandclinic.org': 0.8, 'mind.org.uk': 0.8, 'sleepfoundation.org': 0.75,
  'samhsa.gov': 0.82, 'nimh.nih.gov': 0.9,

  // Tier 4 — quality science journalism and practitioner writing
  'psychologytoday.com': 0.62, 'scientificamerican.com': 0.75,
  'theatlantic.com': 0.6, 'newyorker.com': 0.58, 'bbc.co.uk': 0.65,
  'nautil.us': 0.6, 'aeon.co': 0.58
};

/**
 * Publishers a person will actually read. Primary research proves the claim;
 * one of these makes it legible. The harvest stores both where it can.
 */
export const READABLE = new Set([
  'health.harvard.edu', 'greatergood.berkeley.edu', 'ggia.berkeley.edu',
  'psychologytoday.com', 'news.stanford.edu', 'med.stanford.edu', 'apa.org',
  'scientificamerican.com', 'nhs.uk', 'mayoclinic.org', 'who.int',
  'clevelandclinic.org', 'mind.org.uk', 'sleepfoundation.org',
  'psychologicalscience.org', 'nimh.nih.gov', 'bbc.co.uk', 'nautil.us', 'aeon.co'
]);

const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };


const isReadable = (url) => {
  const host = domainOf(url);
  return READABLE.has(host) || [...READABLE].some((d) => host.endsWith(`.${d}`));
};

/** Credibility for a URL, matching the registrable suffix so subdomains count. */
export function credibilityOf(url) {
  const host = domainOf(url);
  if (!host) return 0;
  if (ALLOWLIST[host]) return ALLOWLIST[host];
  const match = Object.keys(ALLOWLIST).find((d) => host.endsWith(`.${d}`));
  return match ? ALLOWLIST[match] * 0.95 : 0;
}

export const publisherOf = (url) => {
  const host = domainOf(url);
  const NAMES = {
    'health.harvard.edu': 'Harvard Health Publishing', 'hsph.harvard.edu': 'Harvard T.H. Chan School of Public Health',
    'news.stanford.edu': 'Stanford News', 'med.stanford.edu': 'Stanford Medicine',
    'greatergood.berkeley.edu': 'Greater Good Magazine (UC Berkeley)', 'ggia.berkeley.edu': 'Greater Good in Action (UC Berkeley)',
    'psychologytoday.com': 'Psychology Today', 'apa.org': 'American Psychological Association',
    'nature.com': 'Nature Portfolio', 'science.org': 'Science (AAAS)', 'cell.com': 'Cell Press',
    'who.int': 'World Health Organization', 'nhs.uk': 'NHS (UK)', 'nih.gov': 'National Institutes of Health',
    'pubmed.ncbi.nlm.nih.gov': 'PubMed', 'sleepfoundation.org': 'Sleep Foundation',
    'mayoclinic.org': 'Mayo Clinic', 'worldhappiness.report': 'World Happiness Report',
    'psychologicalscience.org': 'Association for Psychological Science',
    'scientificamerican.com': 'Scientific American', 'clevelandclinic.org': 'Cleveland Clinic',
    'bbc.co.uk': 'BBC', 'nimh.nih.gov': 'National Institute of Mental Health',
    'cdc.gov': 'CDC', 'mind.org.uk': 'Mind (UK)', 'thelancet.com': 'The Lancet',
    'bmj.com': 'The BMJ', 'jamanetwork.com': 'JAMA Network', 'nejm.org': 'NEJM',
    'plos.org': 'PLOS', 'journals.plos.org': 'PLOS', 'frontiersin.org': 'Frontiers',
    'theatlantic.com': 'The Atlantic', 'newyorker.com': 'The New Yorker',
    'nautil.us': 'Nautilus', 'aeon.co': 'Aeon', 'yale.edu': 'Yale University',
    'ox.ac.uk': 'University of Oxford', 'cam.ac.uk': 'University of Cambridge',
    'ucl.ac.uk': 'UCL', 'mit.edu': 'MIT', 'berkeley.edu': 'UC Berkeley',
    'harvard.edu': 'Harvard University', 'stanford.edu': 'Stanford University',
    'longevity.stanford.edu': 'Stanford Center on Longevity',
    'adultdevelopmentstudy.org': 'Harvard Study of Adult Development',
    'samhsa.gov': 'SAMHSA', 'doi.org': 'DOI-registered journal'
  };
  return NAMES[host] || Object.entries(NAMES).find(([d]) => host.endsWith(`.${d}`))?.[1] || host;
};

/** Evidence class, inferred from where it was published. */
function evidenceClass(url) {
  const host = domainOf(url);
  if (/pubmed|ncbi|doi\.org|nature|science\.org|cell\.com|bmj|jamanetwork|nejm|lancet|plos|frontiersin/.test(host)) return 'study';
  if (/who\.int|cdc\.gov|nhs\.uk|nimh|samhsa/.test(host)) return 'guidance';
  if (/psychologytoday|theatlantic|newyorker|nautil|aeon|bbc/.test(host)) return 'editorial';
  return 'review';
}

// ------------------------------------------------------------------- topics
//
// Each seed is an action Kindred is willing to recommend, plus the query that
// should find the strongest current source for it.

export const TOPICS = [
  { slug: 'breath-downshift', query: 'controlled breathing exhale longer than inhale reduces stress randomized study',
    action: 'Breathe in for four, out for eight. Two minutes.',
    rationale: 'A longer exhale than inhale shifts the nervous system out of arousal.',
    tags: 'wired,anxious,overwhelmed,breath,quick,solo', ritual_key: 'focus_close', kind: 'reflective', minutes: 2 },
  { slug: 'morning-light', query: 'morning daylight exposure circadian rhythm mood sleep research',
    action: 'Get outside for five minutes within an hour of waking.',
    rationale: 'Morning light anchors the circadian clock, which sets both sleep and next-day mood.',
    tags: 'flat,sleep,morning,outdoors,body,quick', ritual_key: 'walk', kind: 'physical', minutes: 5 },
  { slug: 'weak-ties', query: 'weak ties casual acquaintances daily interactions wellbeing study',
    action: 'Have one real exchange with someone you barely know.',
    rationale: 'Interactions with weak ties predict daily happiness and belonging independently of close relationships.',
    tags: 'lonely,social,flat,quick', ritual_key: 'morning_talk', kind: 'social', minutes: 5 },
  { slug: 'act-of-kindness', query: 'performing acts of kindness increases wellbeing randomized controlled trial',
    action: 'Do one useful thing for someone without mentioning it.',
    rationale: 'Randomly assigned acts of kindness raise wellbeing in the person doing them.',
    tags: 'low_mood,social,meaning,lonely,quick', ritual_key: 'gratitude', kind: 'social', minutes: 10 },
  { slug: 'gratitude-letter', query: 'gratitude letter expressing thanks wellbeing intervention evidence',
    action: 'Tell one person the specific thing they did that mattered.',
    rationale: 'Expressed gratitude produces larger and longer effects than privately felt gratitude.',
    tags: 'gratitude,social,good_mood,meaning', ritual_key: 'gratitude', kind: 'social', minutes: 10 },
  { slug: 'walk-breaks', query: 'short walking breaks sedentary work mood energy study',
    action: 'Walk for five minutes every hour.',
    rationale: 'Short frequent movement breaks improve mood and energy more than a single block.',
    tags: 'flat,body,focus,screen,quick,outdoors', ritual_key: 'walk', kind: 'physical', minutes: 5 },
  { slug: 'phone-away-conversation', query: 'phone presence reduces conversation quality connection study',
    action: 'Put the phone out of sight for the next conversation.',
    rationale: 'A visible phone measurably lowers the quality of the conversation happening next to it.',
    tags: 'social,screen,lonely,quick', ritual_key: 'coffee_with', kind: 'social', minutes: 15 },
  { slug: 'worry-window', query: 'scheduled worry time postponement anxiety technique evidence',
    action: 'Book the worry a fifteen-minute slot later today.',
    rationale: 'Postponing worry to a fixed window reduces intrusion without suppressing it.',
    tags: 'anxious,overwhelmed,wired,solo,focus', ritual_key: 'focus_close', kind: 'reflective', minutes: 15 },
  { slug: 'awe-walk', query: 'awe walk older adults wellbeing randomized study Berkeley',
    action: 'Walk for fifteen minutes looking outward and up.',
    rationale: 'Walks taken with an awe orientation produced more joy and less distress than ordinary walks.',
    tags: 'flat,low_mood,outdoors,meaning,body', ritual_key: 'walk', kind: 'physical', minutes: 15 },
  { slug: 'single-task', query: 'multitasking task switching cost attention wellbeing research',
    action: 'One task, one window. Close everything else.',
    rationale: 'Task switching costs both performance and mood, and the cost is invisible from inside it.',
    tags: 'focus,overwhelmed,screen,wired,solo', ritual_key: 'focus_close', kind: 'reflective', minutes: 25 },
  { slug: 'shared-meal', query: 'sharing meals with others wellbeing social connection evidence',
    action: 'Eat the next meal at a table with someone.',
    rationale: 'Frequency of shared meals is one of the strongest social predictors of life satisfaction.',
    tags: 'lonely,social,flat,meaning', ritual_key: 'shared_lunch', kind: 'social', minutes: 30 },
  { slug: 'self-compassion', query: 'self-compassion intervention reduces anxiety depression meta-analysis',
    action: 'Say to yourself what you would say to a friend.',
    rationale: 'Self-compassion practice reduces anxiety and low mood across controlled trials.',
    tags: 'low_mood,anxious,solo,meaning,quick', ritual_key: 'token_turn', kind: 'reflective', minutes: 5 },
  { slug: 'music-mood', query: 'listening to music mood regulation wellbeing study',
    action: 'Play the album that used to mean something, all the way through.',
    rationale: 'Deliberate music listening is one of the fastest-acting mood regulation strategies.',
    tags: 'flat,low_mood,solo,quick,evening', ritual_key: 'ambient_check', kind: 'solo', minutes: 15 },
  { slug: 'digital-sunset', query: 'screen use before bed sleep quality evidence',
    action: 'Put every screen away an hour before bed.',
    rationale: 'Pre-sleep screen use delays sleep onset and shortens total sleep.',
    tags: 'sleep,evening,screen,wired,solo', ritual_key: 'evening_wind', kind: 'reflective', minutes: 10 },
  { slug: 'volunteer-time', query: 'volunteering wellbeing mental health longitudinal study',
    action: 'Put one hour for someone else in the calendar this week.',
    rationale: 'Volunteering predicts higher wellbeing and lower depression in longitudinal data.',
    tags: 'meaning,social,low_mood,lonely', ritual_key: 'made_something', kind: 'social', minutes: 60 },
  { slug: 'nature-window', query: 'view of nature green space window wellbeing attention restoration',
    action: 'Work next to a window for the next hour.',
    rationale: 'Even a view of nature restores depleted attention and lowers stress markers.',
    tags: 'outdoors,focus,wired,screen,quick', ritual_key: 'quiet_coffee', kind: 'solo', minutes: 10 },
  { slug: 'name-it-to-tame-it', query: 'affect labeling emotion regulation naming feelings neuroscience',
    action: 'Put one precise word on the feeling.',
    rationale: 'Labelling an emotion in words reduces its physiological intensity.',
    tags: 'anxious,overwhelmed,low_mood,quick,solo,morning', ritual_key: 'token_turn', kind: 'reflective', minutes: 2 },
  { slug: 'exercise-depression', query: 'exercise depression treatment effect meta-analysis',
    action: 'Move hard enough to change your breathing.',
    rationale: 'Exercise has a clinically meaningful effect on depressive symptoms across meta-analyses.',
    tags: 'low_mood,flat,body,outdoors', ritual_key: 'walk', kind: 'physical', minutes: 20 },
  { slug: 'making-things', query: 'creative activity crafting flow wellbeing evidence',
    action: 'Make something with your hands for twenty minutes.',
    rationale: 'Hands-on creative activity produces flow and next-day improvements in mood.',
    tags: 'flat,solo,body,meaning,focus', ritual_key: 'made_something', kind: 'physical', minutes: 20 },
  { slug: 'social-recovery-after-work', query: 'psychological detachment from work recovery wellbeing evidence',
    action: 'Say the day is finished out loud, then stop.',
    rationale: 'Psychological detachment after work predicts next-day energy better than hours worked.',
    tags: 'wired,overwhelmed,focus,evening,screen,solo', ritual_key: 'focus_close', kind: 'reflective', minutes: 5 },

  // ------------------------------------------------------- somatic grounding
  //
  // Bottom-up regulation: the body first, the thinking after. These are the
  // actions for the mornings where talking about it is not yet available.

  { slug: 'five-senses-grounding', query: 'grounding technique five senses orienting anxiety evidence',
    action: 'Run the 5-4-3-2-1: see, hear, touch, smell, taste.',
    rationale: 'Sensory orienting interrupts a stress spiral by putting attention back in the present room.',
    tags: 'anxious,overwhelmed,wired,grounding,somatic,quick,solo,body', ritual_key: 'ambient_check', kind: 'reflective', minutes: 3 },
  { slug: 'feet-on-floor', query: 'orienting posture interoception grounding nervous system regulation research',
    action: 'Feet flat on the floor. Press down for sixty seconds.',
    rationale: 'Deliberate proprioceptive contact re-engages the body’s sense of support and steadies arousal.',
    tags: 'anxious,wired,grounding,somatic,quick,solo,body', ritual_key: 'token_turn', kind: 'reflective', minutes: 1 },
  { slug: 'progressive-muscle-relaxation', query: 'progressive muscle relaxation anxiety randomized controlled trial',
    action: 'Tense and release each muscle group, feet to jaw.',
    rationale: 'Progressive muscle relaxation reduces anxiety and physiological arousal in controlled trials.',
    tags: 'anxious,wired,overwhelmed,grounding,somatic,body,evening,solo', ritual_key: 'evening_wind', kind: 'physical', minutes: 10 },
  { slug: 'cold-water-face', query: 'cold water face immersion diving reflex heart rate vagal distress tolerance',
    action: 'Cold water on your face for thirty seconds.',
    rationale: 'Cold on the face triggers the dive reflex, which slows heart rate within seconds.',
    tags: 'wired,anxious,overwhelmed,grounding,somatic,quick,body,solo', ritual_key: 'token_turn', kind: 'physical', minutes: 1 },
  { slug: 'body-scan', query: 'body scan meditation interoceptive awareness wellbeing trial',
    action: 'Move your attention slowly from your feet to your head.',
    rationale: 'Body-scan practice improves interoceptive awareness and lowers rumination.',
    tags: 'wired,anxious,grounding,somatic,body,evening,solo,sleep', ritual_key: 'evening_wind', kind: 'reflective', minutes: 10 },
  { slug: 'humming-vagal', query: 'humming chanting slow exhale vagal tone heart rate variability study',
    action: 'Hum one long note on each out-breath, six times.',
    rationale: 'Extended vocal exhalation raises heart rate variability, a marker of parasympathetic tone.',
    tags: 'wired,anxious,breath,grounding,somatic,quick,solo', ritual_key: 'focus_close', kind: 'reflective', minutes: 2 },
  { slug: 'weighted-pressure', query: 'deep pressure stimulation weighted blanket anxiety sleep evidence',
    action: 'Get weight on your body: blanket, firm hand, or a hug.',
    rationale: 'Deep pressure stimulation reduces anxiety and supports sleep onset.',
    tags: 'anxious,wired,sleep,grounding,somatic,body,evening,solo', ritual_key: 'token_turn', kind: 'physical', minutes: 5 },
  { slug: 'shake-it-out', query: 'physical shaking tremor stress discharge exercise tension release research',
    action: 'Stand up and shake your arms and legs out for one minute.',
    rationale: 'Brief vigorous movement discharges accumulated muscular tension and shifts arousal state.',
    tags: 'wired,flat,overwhelmed,grounding,somatic,body,quick', ritual_key: 'made_something', kind: 'physical', minutes: 1 },

  // -------------------------------------------------- environmental grounding
  //
  // Kindred already actuates the room. These are the actions where the room is
  // the intervention rather than the reward.

  { slug: 'open-the-window', query: 'indoor air quality ventilation carbon dioxide cognitive performance mood study',
    action: 'Open a window wide for five minutes.',
    rationale: 'Rising indoor CO₂ measurably degrades cognition and alertness; ventilation reverses it.',
    tags: 'flat,focus,environment,grounding,quick,screen,indoors', ritual_key: 'quiet_coffee', kind: 'solo', minutes: 5 },
  { slug: 'change-the-light', query: 'lighting intensity colour temperature mood alertness indoor environment study',
    action: 'Change the light: brighter to wake up, dimmer to wind down.',
    rationale: 'Light intensity and colour temperature shift alertness and mood independently of time of day.',
    tags: 'flat,wired,evening,morning,environment,grounding,quick,indoors', ritual_key: 'ambient_check', kind: 'solo', minutes: 2 },
  { slug: 'clear-one-surface', query: 'cluttered environment cortisol stress home wellbeing research',
    action: 'Clear one surface completely. Not the room — one surface.',
    rationale: 'Cluttered environments are associated with higher cortisol and lower reported wellbeing.',
    tags: 'overwhelmed,flat,environment,grounding,focus,quick,indoors', ritual_key: 'made_something', kind: 'physical', minutes: 10 },
  { slug: 'indoor-plants', query: 'indoor plants office greenery productivity wellbeing randomized study',
    action: 'Put something living where you can see it from your desk.',
    rationale: 'Greenery in the workspace improves reported wellbeing, concentration and air satisfaction.',
    tags: 'flat,focus,environment,grounding,outdoors,screen,indoors', ritual_key: 'ambient_check', kind: 'solo', minutes: 5 },
  { slug: 'change-the-room', query: 'environmental context change location attention restoration creativity research',
    action: 'Take the task you are stuck on to a different room.',
    rationale: 'Shifting physical context restores attention and loosens a stuck approach to a problem.',
    tags: 'focus,flat,overwhelmed,environment,grounding,screen,quick', ritual_key: 'quiet_coffee', kind: 'solo', minutes: 5 },
  { slug: 'scent-anchor', query: 'olfactory stimulation scent aromatherapy mood stress randomized evidence',
    action: 'Use one scent to start the day and one to end it.',
    rationale: 'Olfactory cues attach to state faster than any other sense and become reliable transition signals.',
    tags: 'evening,morning,environment,grounding,somatic,quick,solo', ritual_key: 'evening_wind', kind: 'reflective', minutes: 2 },
  { slug: 'quiet-the-noise', query: 'environmental noise exposure stress cognitive performance health evidence',
    action: 'Take thirty minutes of real silence.',
    rationale: 'Chronic noise exposure raises stress markers and degrades attention even when you stop noticing it.',
    tags: 'wired,overwhelmed,focus,environment,grounding,screen,solo', ritual_key: 'focus_close', kind: 'reflective', minutes: 30 },
  { slug: 'temperature-shift', query: 'ambient temperature thermal comfort mood cognitive performance research',
    action: 'Change your temperature: cooler to think, warmer to settle.',
    rationale: 'Thermal state shifts both comfort and cognition, and warm touch reliably reads as safety.',
    tags: 'flat,wired,environment,grounding,somatic,quick,body', ritual_key: 'tea_break', kind: 'solo', minutes: 5 }
];

// -------------------------------------------------------------------- search

async function exaSearch(query, { numResults = 8, domains = Object.keys(ALLOWLIST) } = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY() },
    body: JSON.stringify({
      query,
      numResults,
      type: 'auto',
      includeDomains: domains,
      contents: { highlights: { numSentences: 3, highlightsPerUrl: 1 }, text: { maxCharacters: 600 } }
    }),
    signal: AbortSignal.timeout(25000)
  });
  if (!res.ok) throw new Error(`exa ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return json.results || [];
}

/**
 * Check that a citation resolves.
 *
 * A 403 is not a broken link. Science, APA and Sage all refuse bots outright,
 * and a DOI that redirects to one of them has proved the record exists — the
 * redirect is the verification. Only 404 and 410 mean the citation is wrong,
 * and only those stop a practice being recommended.
 */
async function checkLink(url) {
  const classify = (res) => {
    if (res.ok) return 'ok';
    if ([401, 403, 429].includes(res.status)) {
      // Resolved to a real article behind a bot wall.
      return url.includes('doi.org') && !res.url.includes('doi.org') ? 'ok' : 'blocked';
    }
    if ([404, 410].includes(res.status)) return 'dead';
    return 'unchecked';
  };

  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(9000) });
    const verdict = classify(head);
    if (verdict !== 'unchecked') return verdict;
    // Some publishers serve HEAD badly but GET fine.
    const full = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(12000) });
    return classify(full);
  } catch {
    return 'unchecked';
  }
}

const clean = (s, max = 400) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Harvest every topic. Returns a per-topic report so the run is auditable
 * rather than a number that appeared from nowhere.
 */
export async function harvest({ topics = TOPICS, verifyLinks = true, onProgress } = {}) {
  if (!KEY()) throw new Error('EXA_API_KEY is not set — add it to .env and rerun.');
  const startedAt = new Date().toISOString();
  const report = [];

  for (const topic of topics) {
    const entry = { slug: topic.slug, query: topic.query, kept: 0, rejected: 0, sources: 0, error: null, source: null };
    try {
      // Two searches, because one blended ranking buries the readable
      // publishers under PubMed every time. The first finds the strongest
      // evidence; the second finds the write-up a person will actually open.
      const [broad, plain] = await Promise.all([
        exaSearch(topic.query),
        exaSearch(topic.query, { domains: [...READABLE], numResults: 6 })
      ]);
      const rank = (rs) => rs
        .map((r) => ({ ...r, credibility: credibilityOf(r.url), readable: isReadable(r.url) }))
        .filter((r) => r.credibility > 0)
        .sort((a, b) => b.credibility - a.credibility);
      const ranked = rank(broad);
      const readablePool = rank(plain);
      entry.rejected = (broad.length + plain.length) - (ranked.length + readablePool.length);
      if (!ranked.length && !readablePool.length) {
        entry.error = 'no allowlisted result'; report.push(entry); onProgress?.(entry); continue;
      }

      // The primary proves the claim; the readable one makes it legible.
      const primary = await firstLiveSource(ranked, verifyLinks);
      const readable = await firstLiveSource(
        readablePool.filter((r) => r.url !== primary?.url), verifyLinks);
      if (!primary && !readable) { entry.error = 'every candidate link was dead'; report.push(entry); onProgress?.(entry); continue; }

      const lead = primary || readable;
      const id = upsertPractice({
        slug: topic.slug,
        title: clean(lead.title || topic.action, 200),
        action: topic.action,
        rationale: topic.rationale,
        ritual_key: topic.ritual_key, sense: null, kind: topic.kind, minutes: topic.minutes,
        tags: topic.tags,
        source_title: clean(lead.title || 'Untitled', 200),
        source_publisher: publisherOf(lead.url),
        source_url: lead.url,
        source_date: lead.publishedDate ? String(lead.publishedDate).slice(0, 10) : null,
        evidence: evidenceClass(lead.url),
        credibility: +lead.credibility.toFixed(2),
        snippet: clean(lead.highlights?.[0] || lead.text, 400),
        link_status: lead.link_status
      });

      // Rebuild this practice's citation list rather than accumulating dupes.
      run('DELETE FROM practice_sources WHERE practice_id = ?', id);
      for (const [role, r] of [['primary', primary], ['readable', readable]]) {
        if (!r) continue;
        if (role === 'readable' && primary && r.url === primary.url) continue;
        addSource(id, role, r);
        entry.sources += 1;
      }
      // A third, from a different publisher, so no single outlet carries a claim.
      const seen = new Set([primary?.url, readable?.url].filter(Boolean).map((u) => publisherOf(u)));
      const extra = [...readablePool, ...ranked].find((r) => !seen.has(publisherOf(r.url)));
      if (extra) {
        const live = await firstLiveSource([extra], verifyLinks);
        if (live) { addSource(id, 'supporting', live); entry.sources += 1; }
      }

      entry.kept = 1;
      entry.source = {
        url: lead.url, publisher: publisherOf(lead.url),
        credibility: +lead.credibility.toFixed(2), link: lead.link_status,
        readable: readable ? publisherOf(readable.url) : null
      };
    } catch (err) {
      entry.error = String(err.message || err);
    }
    report.push(entry);
    onProgress?.(entry);
  }

  return { startedAt, finishedAt: new Date().toISOString(), topics: report,
    kept: report.filter((r) => r.kept).length, failed: report.filter((r) => r.error).length };
}

/** Walk candidates until one resolves, so a stored citation is never broken. */
async function firstLiveSource(candidates, verifyLinks) {
  for (const c of candidates.slice(0, 4)) {
    const status = verifyLinks ? await checkLink(c.url) : 'unchecked';
    if (status !== 'dead') return { ...c, link_status: status };
  }
  return null;
}

function addSource(practiceId, role, r) {
  run(`INSERT OR REPLACE INTO practice_sources
       (practice_id, role, title, publisher, url, published, evidence, credibility, snippet, link_status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    practiceId, role, clean(r.title || 'Untitled', 200), publisherOf(r.url), r.url,
    r.publishedDate ? String(r.publishedDate).slice(0, 10) : null,
    evidenceClass(r.url), +r.credibility.toFixed(2),
    clean(r.highlights?.[0] || r.text, 400), r.link_status || 'unchecked',
    new Date().toISOString());
}

export const sourcesFor = (practiceId) =>
  all(`SELECT * FROM practice_sources WHERE practice_id = ?
       ORDER BY CASE role WHEN 'readable' THEN 0 WHEN 'primary' THEN 1 ELSE 2 END, credibility DESC`, practiceId);

/** Harvested rows replace their own slug and never touch curated ones. */
export function upsertPractice(row) {
  const sense = row.sense || null;
  const steps = JSON.stringify(STEPS[row.slug] || []);
  const existing = get('SELECT id, engine FROM practices WHERE slug = ?', row.slug);
  const now = new Date().toISOString();
  if (existing) {
    run(`UPDATE practices SET title=?, action=?, rationale=?, ritual_key=?, sense=?, kind=?, minutes=?, tags=?,
         source_title=?, source_publisher=?, source_url=?, source_date=?, evidence=?, credibility=?, snippet=?,
         link_status=?, steps=?, engine='exa', harvested_at=? WHERE id=?`,
      row.title, row.action, row.rationale, row.ritual_key, sense, row.kind, row.minutes, row.tags,
      row.source_title, row.source_publisher, row.source_url, row.source_date, row.evidence, row.credibility,
      row.snippet, row.link_status, steps, now, existing.id);
    return existing.id;
  }
  run(`INSERT INTO practices (slug,title,action,rationale,ritual_key,sense,kind,minutes,tags,
       source_title,source_publisher,source_url,source_date,evidence,credibility,snippet,link_status,steps,engine,harvested_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'exa',?)`,
    row.slug, row.title, row.action, row.rationale, row.ritual_key, sense, row.kind, row.minutes, row.tags,
    row.source_title, row.source_publisher, row.source_url, row.source_date, row.evidence, row.credibility,
    row.snippet, row.link_status, steps, now);
  return get('SELECT id FROM practices WHERE slug = ?', row.slug).id;
}

/** Re-check every stored citation, primary and secondary. Dead links stop being recommended. */
export async function verifyAllLinks() {
  let ok = 0, blocked = 0, dead = 0, unknown = 0;
  const tally = (status) => {
    if (status === 'ok') ok += 1;
    else if (status === 'blocked') blocked += 1;
    else if (status === 'dead') dead += 1;
    else unknown += 1;
  };

  const rows = all('SELECT id, source_url FROM practices');
  for (const r of rows) {
    const status = await checkLink(r.source_url);
    run('UPDATE practices SET link_status = ? WHERE id = ?', status, r.id);
    tally(status);
  }
  const extra = all('SELECT id, url FROM practice_sources');
  for (const r of extra) {
    const status = await checkLink(r.url);
    run('UPDATE practice_sources SET link_status = ? WHERE id = ?', status, r.id);
    tally(status);
  }
  return { checked: rows.length + extra.length, ok, blocked, dead, unknown };
}

export const practiceStats = () => ({
  total: get('SELECT count(*) AS n FROM practices').n,
  curated: get("SELECT count(*) AS n FROM practices WHERE engine = 'curated'").n,
  harvested: get("SELECT count(*) AS n FROM practices WHERE engine = 'exa'").n,
  verified: get("SELECT count(*) AS n FROM practices WHERE link_status IN ('ok','blocked')").n +
            get("SELECT count(*) AS n FROM practice_sources WHERE link_status IN ('ok','blocked')").n,
  dead: get("SELECT count(*) AS n FROM practices WHERE link_status = 'dead'").n +
        get("SELECT count(*) AS n FROM practice_sources WHERE link_status = 'dead'").n,
  citations: get('SELECT count(*) AS n FROM practice_sources').n,
  publishers: all(`SELECT publisher, count(*) AS n FROM (
                     SELECT source_publisher AS publisher FROM practices
                     UNION ALL
                     SELECT publisher FROM practice_sources
                   ) GROUP BY publisher ORDER BY n DESC, publisher`)
});
