// How to actually do it.
//
// An action line tells someone what to do. Steps tell them how, in the order
// they happen, short enough to hold in your head while doing it. Kept separate
// from both the curated catalogue and the harvest topics so the instructions
// can be edited as writing, without touching the evidence they sit on.
//
// Rules: two to four steps, under about ten words each, imperative, no jargon,
// and the last step says how you know you are done.

export const STEPS = {
  // ---------------------------------------------------------------- curated
  'cyclic-sighing': [
    'Breathe in through your nose until your lungs feel full.',
    'Sip a second short breath in on top of it.',
    'Let it all out through your mouth, slowly.',
    'Repeat for five minutes.'
  ],
  'two-hours-nature': [
    'Pick somewhere with trees, water or open sky.',
    'Walk for twenty minutes without your headphones in.',
    'Leave the phone in your pocket the whole way.'
  ],
  'three-good-things': [
    'Write down three things that went well today.',
    'Next to each one, write why it happened.',
    'Keep them small and specific — the coffee counts.'
  ],
  'talk-to-the-stranger': [
    'Pick one person you do not normally speak to.',
    'Say something about where you both are right now.',
    'Let it be short. One exchange is the whole thing.'
  ],
  'relationships-are-the-finding': [
    'Think of the person you keep meaning to contact.',
    'Tell them the specific thing, not "how are you".',
    'Send it before you edit it.'
  ],
  'spend-on-someone-else': [
    'Find someone you are already near.',
    'Buy the coffee, or the lunch, or the small thing.',
    'Do not mention that you are doing it on purpose.'
  ],
  'wandering-mind': [
    'Pick the next ordinary thing you have to do.',
    'Do only that, with your attention actually on it.',
    'When your mind leaves, bring it back. That is the practice.'
  ],
  'expressive-writing': [
    'Set a timer for fifteen minutes.',
    'Write about the thing taking up room. Do not stop.',
    'Do not edit it, and do not show anyone.'
  ],
  'distanced-self-talk': [
    'Say the problem out loud using your own name.',
    'Ask what you would tell a friend in this position.',
    'Answer yourself the same way — by name.'
  ],
  'movement-guideline': [
    'Decide how long you actually have. Ten minutes is fine.',
    'Move for that long, at whatever pace you can hold.',
    'Stop when the time is up, not when you are tired.'
  ],
  'savouring-the-ordinary': [
    'Pick one good thing that already happened today.',
    'Hold it in mind for a full sixty seconds.',
    'Name what specifically was good about it.'
  ],
  'eat-with-someone': [
    'Find one person eating around the same time.',
    'Sit at a table with them, not at your desk.',
    'Put the phone face down and out of reach.'
  ],
  'consistent-wake-time': [
    'Pick tomorrow’s wake time now and set the alarm.',
    'Keep it even if tonight goes badly.',
    'Keep it at the weekend too — that is where it works.'
  ],
  'behavioural-activation': [
    'Think of something that used to feel good.',
    'Shrink it until it takes ten minutes or less.',
    'Do it now, before you feel like it. Motivation comes after.'
  ],
  'boundary-between-work-and-rest': [
    'Say out loud what the last task of the day was.',
    'Write down the first thing you will do tomorrow.',
    'Close the laptop and leave the room.'
  ],
  'name-the-feeling': [
    'Stop and notice what you are feeling.',
    'Find the precise word for it — not "bad".',
    'Say it, or write it down. That is all.'
  ],

  // ---------------------------------------------------------------- general
  'breath-downshift': [
    'Breathe in through your nose for a count of four.',
    'Breathe out through your mouth for a count of eight.',
    'Keep the exhale longer than the inhale. Two minutes.'
  ],
  'morning-light': [
    'Get outside within an hour of waking up.',
    'Stay five minutes. No sunglasses, no phone.',
    'Cloudy still works — outdoor light beats indoor light.'
  ],
  'weak-ties': [
    'Pick someone you see but do not really know.',
    'Say one real thing, not just hello.',
    'One exchange is enough. Do not make it a project.'
  ],
  'act-of-kindness': [
    'Notice one thing that would help someone today.',
    'Do it without being asked.',
    'Do not tell them, and do not tell anyone else.'
  ],
  'gratitude-letter': [
    'Pick one person who did something that mattered.',
    'Write what they did and what it changed for you.',
    'Send it. Specific beats nice.'
  ],
  'walk-breaks': [
    'Set an hourly reminder for the rest of today.',
    'When it goes off, stand up and walk five minutes.',
    'Anywhere counts — stairs, corridor, outside.'
  ],
  'phone-away-conversation': [
    'Before the next conversation, put your phone away.',
    'Not face down on the table — out of sight.',
    'Leave it there until the conversation ends.'
  ],
  'worry-window': [
    'Write the worry down in one line.',
    'Book fifteen minutes later today to think about it.',
    'When it comes back before then, point at the booking.'
  ],
  'awe-walk': [
    'Go for a fifteen-minute walk anywhere.',
    'Look outward and up, not down at your feet.',
    'Find one thing bigger or older than your day.'
  ],
  'single-task': [
    'Pick the one task that matters most right now.',
    'Close every other tab, window and app.',
    'Stay on it until it is done or the timer ends.'
  ],
  'shared-meal': [
    'Find someone eating around the same time as you.',
    'Sit down together, away from your desk.',
    'Eat the whole meal there.'
  ],
  'self-compassion': [
    'Notice what you are saying to yourself.',
    'Ask what you would say to a friend in this exact spot.',
    'Say that to yourself instead, in those words.'
  ],
  'music-mood': [
    'Pick the album that used to mean something.',
    'Put it on properly — headphones or speakers, not background.',
    'Listen all the way through without doing anything else.'
  ],
  'digital-sunset': [
    'Pick the time you want to be asleep.',
    'Put every screen away an hour before that.',
    'Leave the phone charging in another room.'
  ],
  'volunteer-time': [
    'Pick one thing that is not about you.',
    'Find the hour in your calendar this week.',
    'Put it in now, with a name and a time.'
  ],
  'nature-window': [
    'Move to a seat with a window, or facing something green.',
    'Work there for the next hour.',
    'Look up and out every so often. That is the mechanism.'
  ],
  'name-it-to-tame-it': [
    'Pause and check what you are actually feeling.',
    'Find the exact word — anxious, not "stressed"; hurt, not "fine".',
    'Say it out loud or write it down.'
  ],
  'exercise-depression': [
    'Pick anything that changes your breathing.',
    'Do it for as long as you have — ten minutes counts.',
    'Finish slightly out of breath. That is the dose.'
  ],
  'making-things': [
    'Pick something you can make with your hands.',
    'Work on it for twenty minutes.',
    'It does not have to be good, or finished.'
  ],
  'social-recovery-after-work': [
    'Say out loud that the work day is finished.',
    'Write tomorrow’s first task on paper.',
    'Shut the laptop and physically leave the space.'
  ],

  // ------------------------------------------------------- somatic grounding
  'five-senses-grounding': [
    'Name five things you can see, out loud or in your head.',
    'Then four you can hear, three you can touch.',
    'Then two you can smell, and one you can taste.',
    'If you lose count, start again. Losing count is normal.'
  ],
  'feet-on-floor': [
    'Put both feet flat on the floor.',
    'Press down and feel the floor push back.',
    'Let the chair take your weight for a slow count of sixty.'
  ],
  'progressive-muscle-relaxation': [
    'Start at your feet. Tense hard for five seconds.',
    'Let go all at once and notice the difference.',
    'Work upward: legs, stomach, hands, shoulders, jaw, face.'
  ],
  'cold-water-face': [
    'Run the tap cold and cup your hands.',
    'Hold cold water against your face for thirty seconds.',
    'Cold wrists work too if your face is not an option.'
  ],
  'body-scan': [
    'Lie down or sit back with your eyes closed.',
    'Move your attention slowly from your feet to your head.',
    'Notice each part without trying to fix or change it.'
  ],
  'humming-vagal': [
    'Breathe in normally through your nose.',
    'Hum one long note all the way out.',
    'Do it six times. You should feel your throat buzz.'
  ],
  'weighted-pressure': [
    'Get weight onto your chest or shoulders.',
    'A heavy blanket, a firm hand, or a proper hug.',
    'Stay under it for five minutes and breathe slowly.'
  ],
  'shake-it-out': [
    'Stand up with a bit of space around you.',
    'Shake out your hands, then arms, legs and shoulders.',
    'Keep going for a full minute. Let it look ridiculous.'
  ],

  // -------------------------------------------------- environmental grounding
  'open-the-window': [
    'Open a window as wide as it goes.',
    'Leave it for five minutes, whatever the weather.',
    'Stand near it while you wait.'
  ],
  'change-the-light': [
    'Look at the light you are sitting in right now.',
    'To wake up: brighter and cooler, or go near a window.',
    'To wind down: dim it, and switch to warm lamps.'
  ],
  'clear-one-surface': [
    'Pick one surface — a desk, a counter, a single shelf.',
    'Take everything off it.',
    'Put back only what belongs. Stop there.'
  ],
  'indoor-plants': [
    'Find a plant, or buy the cheapest one near you.',
    'Put it where you look when you glance up.',
    'That is the whole intervention.'
  ],
  'change-the-room': [
    'Pick up the task you are stuck on.',
    'Take it to a different room, chair or café.',
    'Change only where you are — not what you are doing.'
  ],
  'scent-anchor': [
    'Pick one scent for starting, one for stopping.',
    'Use it at the same moment every day.',
    'Give it two weeks. The meaning is what you are building.'
  ],
  'quiet-the-noise': [
    'Pick thirty minutes in today.',
    'Turn off music, podcasts and notifications.',
    'Let it be genuinely quiet, even if it feels strange.'
  ],
  'temperature-shift': [
    'Notice whether you need to wake up or settle down.',
    'To think: cool the room, open a window.',
    'To settle: hold a warm drink in both hands.'
  ]
};

/** Apply the written steps to every practice that has them. */
export function applySteps(run, all) {
  let updated = 0;
  for (const p of all('SELECT id, slug FROM practices')) {
    const steps = STEPS[p.slug];
    if (!steps) continue;
    run('UPDATE practices SET steps = ? WHERE id = ?', JSON.stringify(steps), p.id);
    updated += 1;
  }
  return updated;
}
