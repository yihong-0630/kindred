// The ritual catalogue. Each ritual is a currency-bearing act with a sensory
// channel attached — that channel is what the agent actuates in the room.

export const RITUALS = [
  { key: 'quiet_coffee',   label: 'Quiet coffee',        icon: '☕️', sense: 'smell',   kind: 'solo',       base: 1.0, invested: 0, device: 'diffuser', action: 'citrus',      blurb: 'Seven minutes, no screen.' },
  { key: 'coffee_with',    label: 'Coffee with someone', icon: '🫂', sense: 'taste',   kind: 'social',     base: 2.5, invested: 0, device: 'kettle',   action: 'brew',        blurb: 'The cup is the excuse. The talk is the point.' },
  { key: 'morning_talk',   label: 'Conversation before 10am', icon: '💬', sense: 'hearing', kind: 'social', base: 2.2, invested: 1, device: 'chime',    action: 'soft-open',   blurb: 'One real exchange before the day closes over.' },
  { key: 'walk',           label: 'Walk outside',        icon: '🚶', sense: 'touch',   kind: 'physical',   base: 1.8, invested: 1, device: 'token',    action: 'turn',        blurb: 'Weather is not an obstacle. It is texture.' },
  { key: 'shared_lunch',   label: 'Shared lunch',        icon: '🍲', sense: 'taste',   kind: 'social',     base: 2.8, invested: 0, device: 'kettle',   action: 'table-set',   blurb: 'Eating beside someone counts.' },
  { key: 'tea_break',      label: 'Tea break together',  icon: '🍵', sense: 'taste',   kind: 'social',     base: 2.0, invested: 0, device: 'kettle',   action: 'brew',        blurb: 'Five minutes. That is the whole ask.' },
  { key: 'focus_close',    label: 'Closed a focus block',icon: '🔔', sense: 'hearing', kind: 'reflective', base: 1.4, invested: 1, device: 'chime',    action: 'low-bell',    blurb: 'A boundary, so the next thing starts clean.' },
  { key: 'token_turn',     label: 'Turned the token',    icon: '🪵', sense: 'touch',   kind: 'reflective', base: 1.2, invested: 0, device: 'token',    action: 'turn',        blurb: 'No battery. No screen. Just the weight of it.' },
  { key: 'evening_wind',   label: 'Evening wind-down',   icon: '🌙', sense: 'smell',   kind: 'reflective', base: 1.6, invested: 1, device: 'diffuser', action: 'cedar',       blurb: 'A sensory border between work and rest.' },
  { key: 'ambient_check',  label: 'Looked at the ledger',icon: '🪞', sense: 'sight',   kind: 'reflective', base: 0.8, invested: 0, device: 'lamp',     action: 'amber',       blurb: 'A mirror that tells a kinder story.' },
  { key: 'made_something', label: 'Made something',      icon: '🛠️', sense: 'touch',   kind: 'physical',   base: 2.1, invested: 1, device: 'lamp',     action: 'warm-white',  blurb: 'Hands busy, head quiet.' },
  { key: 'gratitude',      label: 'Told someone why',    icon: '💌', sense: 'hearing', kind: 'social',     base: 2.6, invested: 1, device: 'chime',    action: 'two-tone',    blurb: 'Specific beats nice.' }
];

export const BY_KEY = Object.fromEntries(RITUALS.map((r) => [r.key, r]));

export const SENSES = {
  sight:   { icon: '👁️', device: 'lamp',     label: 'Sight',   line: 'The ambient reframe' },
  hearing: { icon: '👂', device: 'chime',    label: 'Hearing', line: 'The gentle chime' },
  touch:   { icon: '✋', device: 'token',    label: 'Touch',   line: 'The weight of a ritual' },
  smell:   { icon: '👃', device: 'diffuser', label: 'Smell',   line: 'The scent of a moment' },
  taste:   { icon: '👅', device: 'kettle',   label: 'Taste',   line: 'The shared cup' }
};

// PERMA+4 — the well-being framework Kindred operationalises through rituals
// instead of surveys. Each ritual kind feeds a weighted set of blocks.
export const PERMA = [
  'Positive emotion', 'Engagement', 'Relationships', 'Meaning', 'Accomplishment',
  'Physical health', 'Mindset', 'Environment', 'Economic security'
];

export const KIND_TO_PERMA = {
  solo:       { 'Positive emotion': 0.8, Engagement: 0.4, Mindset: 0.7, Environment: 0.5 },
  social:     { Relationships: 1.0, 'Positive emotion': 0.6, Meaning: 0.5 },
  physical:   { 'Physical health': 1.0, Engagement: 0.5, Environment: 0.4 },
  reflective: { Meaning: 0.9, Mindset: 0.6, Accomplishment: 0.5, Engagement: 0.3 }
};
