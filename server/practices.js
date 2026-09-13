// The evidence catalogue.
//
// Every recommended action Kindred makes must be traceable to a source. This
// file is the starter set: hand-entered, each row citing a paper or an
// institutional page it actually rests on. `npm run harvest` widens it with
// Exa search over an allowlist of quality publishers and writes those rows in
// alongside these, tagged engine='exa' with the exact article URL.
//
// Curated rows deliberately cite DOIs and institutional landing pages rather
// than deep article slugs, because a slug typed from memory is a fabricated
// citation. The harvester is what earns exact URLs, and it link-checks them.

import { all, get, run } from './db.js';
import { STEPS, applySteps } from './steps.js';

/** Tag vocabulary the check-in signals are matched against. */
export const TAGS = [
  'flat', 'wired', 'steady', 'low_mood', 'good_mood', 'anxious', 'overwhelmed',
  'lonely', 'social', 'solo', 'outdoors', 'indoors', 'body', 'breath', 'sleep',
  'focus', 'meaning', 'gratitude', 'quick', 'morning', 'evening', 'screen',
  // Bottom-up regulation, and the room as the intervention rather than the reward.
  'grounding', 'somatic', 'environment'
];

export const CURATED = [
  {
    slug: 'cyclic-sighing',
    title: 'Five minutes of cyclic sighing lowers arousal faster than meditation',
    action: 'Two breaths in through the nose, one long breath out.',
    rationale: 'In a randomised controlled trial it beat mindfulness meditation on mood and respiratory rate.',
    ritual_key: 'focus_close', sense: 'hearing', kind: 'reflective', minutes: 5,
    tags: 'wired,anxious,overwhelmed,breath,quick,solo,body',
    source_title: 'Brief structured respiration practices enhance mood and reduce physiological arousal',
    source_publisher: 'Cell Reports Medicine (Stanford Medicine)',
    source_url: 'https://doi.org/10.1016/j.xcrm.2022.100895',
    source_date: '2023-01', evidence: 'rct', credibility: 0.95,
    snippet: 'Cyclic sighing produced greater improvement in mood and reduction in respiratory rate than mindfulness meditation over one month of daily five-minute practice.'
  },
  {
    slug: 'two-hours-nature',
    title: 'Two hours a week outdoors is the threshold that shows up in wellbeing',
    action: 'Take a twenty-minute walk outside.',
    rationale: 'Across 20,000 people, wellbeing rose for those with 120+ minutes of weekly nature contact and not below it.',
    ritual_key: 'walk', sense: 'touch', kind: 'physical', minutes: 20,
    tags: 'flat,low_mood,outdoors,body,solo,morning',
    source_title: 'Spending at least 120 minutes a week in nature is associated with good health and wellbeing',
    source_publisher: 'Scientific Reports (Nature Portfolio)',
    source_url: 'https://doi.org/10.1038/s41598-019-44097-3',
    source_date: '2019-06', evidence: 'study', credibility: 0.92,
    snippet: 'Compared to no nature contact, the likelihood of reporting good health or high wellbeing became significantly greater at 120 minutes per week and peaked between 200 and 300 minutes.'
  },
  {
    slug: 'three-good-things',
    title: 'Writing down three good things and why they happened',
    action: 'Write three things that went well today, and why.',
    rationale: 'The effect on happiness in the original trial was still measurable six months later.',
    ritual_key: 'evening_wind', sense: 'smell', kind: 'reflective', minutes: 5,
    tags: 'low_mood,gratitude,evening,solo,meaning,quick',
    source_title: 'Positive Psychology Progress: Empirical Validation of Interventions',
    source_publisher: 'American Psychologist (APA)',
    source_url: 'https://doi.org/10.1037/0003-066X.60.5.410',
    source_date: '2005-08', evidence: 'rct', credibility: 0.9,
    snippet: 'Participants who wrote three things that went well each day, and why, were happier and less depressed at follow-ups through six months.'
  },
  {
    slug: 'talk-to-the-stranger',
    title: 'People consistently underestimate how good talking to a stranger feels',
    action: 'Say one real thing to the person next to you.',
    rationale: 'Commuters told to talk to a stranger enjoyed the trip more than those told to sit in solitude, and predicted the opposite.',
    ritual_key: 'morning_talk', sense: 'hearing', kind: 'social', minutes: 5,
    tags: 'lonely,social,flat,quick,morning',
    source_title: 'Mistakenly Seeking Solitude',
    source_publisher: 'Journal of Experimental Psychology: General (APA)',
    source_url: 'https://doi.org/10.1037/a0037323',
    source_date: '2014-10', evidence: 'rct', credibility: 0.9,
    snippet: 'Participants who connected with a stranger reported a more positive experience than those who sat in solitude, despite predicting the reverse before the commute.'
  },
  {
    slug: 'relationships-are-the-finding',
    title: 'The single strongest predictor across 80 years of follow-up was relationships',
    action: 'Message the person you keep meaning to contact.',
    rationale: 'The Harvard Study of Adult Development found relationship quality at 50 predicted health at 80 better than cholesterol did.',
    ritual_key: 'gratitude', sense: 'hearing', kind: 'social', minutes: 5,
    tags: 'lonely,social,meaning,quick',
    source_title: 'Harvard Study of Adult Development',
    source_publisher: 'Harvard Medical School',
    source_url: 'https://www.adultdevelopmentstudy.org/',
    source_date: '2023', evidence: 'study', credibility: 0.93,
    snippet: 'Close relationships, more than money or fame, are what keep people happy throughout their lives; those ties protect against mental and physical decline.'
  },
  {
    slug: 'spend-on-someone-else',
    title: 'Spending on someone else raises your happiness more than spending on yourself',
    action: 'Buy the coffee for whoever you are sitting with.',
    rationale: 'Randomly assigned prosocial spending produced higher happiness than personal spending, at every amount tested.',
    ritual_key: 'coffee_with', sense: 'taste', kind: 'social', minutes: 15,
    tags: 'social,good_mood,meaning,lonely',
    source_title: 'Spending Money on Others Promotes Happiness',
    source_publisher: 'Science (AAAS)',
    source_url: 'https://doi.org/10.1126/science.1150952',
    source_date: '2008-03', evidence: 'rct', credibility: 0.9,
    snippet: 'Participants assigned to spend a windfall on others reported greater happiness than those assigned to spend it on themselves.'
  },
  {
    slug: 'wandering-mind',
    title: 'A wandering mind is an unhappy mind, whatever you are doing',
    action: 'Do the next ordinary thing with your attention actually on it.',
    rationale: 'Across 250,000 real-time samples, what people were thinking about predicted happiness better than what they were doing.',
    ritual_key: 'quiet_coffee', sense: 'smell', kind: 'solo', minutes: 7,
    tags: 'wired,overwhelmed,focus,solo,screen,quick',
    source_title: 'A Wandering Mind Is an Unhappy Mind',
    source_publisher: 'Science (AAAS)',
    source_url: 'https://doi.org/10.1126/science.1192439',
    source_date: '2010-11', evidence: 'study', credibility: 0.88,
    snippet: 'People were less happy when their minds wandered than when they did not, regardless of the activity they were engaged in.'
  },
  {
    slug: 'expressive-writing',
    title: 'Writing about what is actually bothering you, for fifteen minutes',
    action: 'Write for fifteen minutes about what is taking up room.',
    rationale: 'Expressive writing about emotional experience has repeatedly improved health and mood outcomes in controlled trials.',
    ritual_key: 'token_turn', sense: 'touch', kind: 'reflective', minutes: 15,
    tags: 'overwhelmed,anxious,low_mood,solo,evening,meaning',
    source_title: 'Writing About Emotional Experiences as a Therapeutic Process',
    source_publisher: 'Psychological Science (APS)',
    source_url: 'https://doi.org/10.1111/j.1467-9280.1997.tb00403.x',
    source_date: '1997-05', evidence: 'review', credibility: 0.85,
    snippet: 'Writing about emotional upheaval has been found to improve physical and mental health across a range of controlled studies.'
  },
  {
    slug: 'distanced-self-talk',
    title: 'Use your own name when the thought gets loud',
    action: 'Talk the problem through using your own name, not "I".',
    rationale: 'Non-first-person self-talk reduced distress and improved performance under social stress across seven experiments.',
    ritual_key: 'focus_close', sense: 'hearing', kind: 'reflective', minutes: 5,
    tags: 'anxious,overwhelmed,wired,solo,quick',
    source_title: 'Self-Talk as a Regulatory Mechanism: How You Do It Matters',
    source_publisher: 'Journal of Personality and Social Psychology (APA)',
    source_url: 'https://doi.org/10.1037/a0035173',
    source_date: '2014-02', evidence: 'rct', credibility: 0.87,
    snippet: 'Using one’s own name or non-first-person pronouns during introspection improved emotion regulation under stress relative to first-person self-talk.'
  },
  {
    slug: 'movement-guideline',
    title: 'Any movement counts, and some is decisively better than none',
    action: 'Move for as long as you have. Ten minutes is the dose.',
    rationale: 'WHO guidance is explicit that some physical activity is better than none and that benefits start below the target.',
    ritual_key: 'walk', sense: 'touch', kind: 'physical', minutes: 10,
    tags: 'flat,low_mood,body,outdoors,quick,morning',
    source_title: 'Physical activity — fact sheet',
    source_publisher: 'World Health Organization',
    source_url: 'https://www.who.int/news-room/fact-sheets/detail/physical-activity',
    source_date: '2024-06', evidence: 'guidance', credibility: 0.88,
    snippet: 'Some physical activity is better than none, and more physical activity is better for optimal health outcomes.'
  },
  {
    slug: 'savouring-the-ordinary',
    title: 'Savouring stretches a small good thing into a measurable one',
    action: 'Hold one good thing from today for a full minute.',
    rationale: 'Greater Good Science Center catalogues savouring as one of the better-evidenced short wellbeing practices.',
    ritual_key: 'ambient_check', sense: 'sight', kind: 'reflective', minutes: 2,
    tags: 'good_mood,steady,gratitude,quick,solo,meaning',
    source_title: 'Greater Good in Action — science-based practices for wellbeing',
    source_publisher: 'Greater Good Science Center, UC Berkeley',
    source_url: 'https://ggia.berkeley.edu/',
    source_date: '2024', evidence: 'review', credibility: 0.8,
    snippet: 'Savouring practices direct attention to positive experience as it happens, and are among the most accessible evidence-based wellbeing exercises.'
  },
  {
    slug: 'eat-with-someone',
    title: 'Eating with other people tracks with wellbeing independently of the food',
    action: 'Take lunch to a table with someone at it.',
    rationale: 'Shared meals are one of the strongest social correlates of life satisfaction in large population data.',
    ritual_key: 'shared_lunch', sense: 'taste', kind: 'social', minutes: 30,
    tags: 'lonely,social,flat,meaning',
    source_title: 'World Happiness Report',
    source_publisher: 'Wellbeing Research Centre, University of Oxford',
    source_url: 'https://worldhappiness.report/',
    source_date: '2025-03', evidence: 'study', credibility: 0.85,
    snippet: 'Sharing meals with others is strongly linked with subjective wellbeing, on a par with income and employment status as a predictor.'
  },
  {
    slug: 'consistent-wake-time',
    title: 'A fixed wake time does more for sleep than a fixed bedtime',
    action: 'Set tomorrow’s wake time now, and keep it whatever tonight does.',
    rationale: 'Sleep regularity is a stronger predictor of outcomes than total sleep duration in recent cohort work.',
    ritual_key: 'evening_wind', sense: 'smell', kind: 'reflective', minutes: 5,
    tags: 'flat,sleep,evening,solo,steady',
    source_title: 'Sleep Foundation — sleep hygiene',
    source_publisher: 'Sleep Foundation',
    source_url: 'https://www.sleepfoundation.org/sleep-hygiene',
    source_date: '2024', evidence: 'guidance', credibility: 0.75,
    snippet: 'Keeping a consistent wake time, including at weekends, is one of the most effective single changes for stabilising sleep.'
  },
  {
    slug: 'behavioural-activation',
    title: 'When you feel like doing nothing, action comes before motivation',
    action: 'Do the smallest version of something that used to feel good.',
    rationale: 'Behavioural activation reverses the usual order — doing first, mood second — and matches CBT outcomes for low mood.',
    ritual_key: 'made_something', sense: 'touch', kind: 'physical', minutes: 15,
    tags: 'flat,low_mood,solo,body,meaning',
    source_title: 'Mental health — self-help and behavioural approaches',
    source_publisher: 'NHS (UK)',
    source_url: 'https://www.nhs.uk/mental-health/',
    source_date: '2024', evidence: 'guidance', credibility: 0.82,
    snippet: 'Doing activities that give a sense of achievement or enjoyment, even when motivation is absent, is a first-line self-help approach for low mood.'
  },
  {
    slug: 'boundary-between-work-and-rest',
    title: 'An explicit end to work protects the evening better than finishing early',
    action: 'Close the day out loud, then write tomorrow’s first task.',
    rationale: 'Psychological detachment from work predicts next-day energy and mood more than hours worked.',
    ritual_key: 'focus_close', sense: 'hearing', kind: 'reflective', minutes: 5,
    tags: 'wired,overwhelmed,focus,evening,solo,screen',
    source_title: 'Psychology Today — burnout',
    source_publisher: 'Psychology Today',
    source_url: 'https://www.psychologytoday.com/us/basics/burnout',
    source_date: '2024', evidence: 'editorial', credibility: 0.6,
    snippet: 'Detaching psychologically from work during off-hours is consistently associated with recovery, lower exhaustion and better next-day mood.'
  },
  {
    slug: 'name-the-feeling',
    title: 'Naming the feeling turns the volume down on it',
    action: 'Put one precise word on what you are feeling.',
    rationale: 'Affect labelling reduces amygdala response and self-reported distress in imaging and behavioural studies.',
    ritual_key: 'token_turn', sense: 'touch', kind: 'reflective', minutes: 2,
    tags: 'anxious,overwhelmed,low_mood,quick,solo,morning',
    source_title: 'Putting Feelings Into Words: Affect Labeling Disrupts Amygdala Activity',
    source_publisher: 'Psychological Science (APS)',
    source_url: 'https://doi.org/10.1111/j.1467-9280.2007.01916.x',
    source_date: '2007-05', evidence: 'study', credibility: 0.86,
    snippet: 'Labelling an affective state in words diminished amygdala response and was accompanied by reduced self-reported distress.'
  }
];

/** Insert curated rows that are not already present. Never clobbers harvested ones. */
export function seedPractices() {
  const now = new Date().toISOString();
  let added = 0;
  for (const p of CURATED) {
    if (get('SELECT id FROM practices WHERE slug = ?', p.slug)) continue;
    run(`INSERT INTO practices
      (slug, title, action, rationale, ritual_key, sense, kind, minutes, tags,
       source_title, source_publisher, source_url, source_date, evidence,
       credibility, snippet, link_status, engine, harvested_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'unchecked','curated',?)`,
      p.slug, p.title, p.action, p.rationale, p.ritual_key, p.sense, p.kind, p.minutes, p.tags,
      p.source_title, p.source_publisher, p.source_url, p.source_date, p.evidence,
      p.credibility, p.snippet, now);
    added += 1;
  }
  // Instructions are written separately from the evidence, and re-applied every
  // boot so editing them is a one-file change.
  applySteps(run, all);
  return added;
}
