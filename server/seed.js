import { db, get, run, all } from './db.js';
import { hashPassword } from './auth.js';
import { RITUALS, BY_KEY } from './rituals.js';
import { seedPractices } from './practices.js';

const DAY = 86400000;

// Deterministic RNG so every demo run tells the same story.
let s = 20260913;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;

const PEOPLE = [
  { team: 'Kindred Core',   name: 'Aina Rahman',   email: 'aina@kindred.app',   avatar: '🌤️', role: 'lead',   profile: 'connector' },
  { team: 'Kindred Core',   name: 'Daniel Okonkwo',email: 'daniel@kindred.app', avatar: '🎧', role: 'member', profile: 'drifting' },
  { team: 'Kindred Core',   name: 'Mei Lin',       email: 'mei@kindred.app',    avatar: '🌱', role: 'member', profile: 'steady'    },
  { team: 'Kindred Core',   name: 'Tomas Bauer',   email: 'tomas@kindred.app',  avatar: '🪵', role: 'member', profile: 'maker'     },
  { team: 'Atlas Platform', name: 'Priya Nair',    email: 'priya@kindred.app',  avatar: '🛰️', role: 'lead',   profile: 'steady'    },
  { team: 'Atlas Platform', name: 'Jonas Vik',     email: 'jonas@kindred.app',  avatar: '⚙️', role: 'member', profile: 'drifting' },
  { team: 'Atlas Platform', name: 'Sofia Marques', email: 'sofia@kindred.app',  avatar: '☕️', role: 'member', profile: 'connector' },
  { team: 'Harbour Support',name: 'Ken Adeyemi',   email: 'ken@kindred.app',    avatar: '🌊', role: 'lead',   profile: 'steady'    },
  { team: 'Harbour Support',name: 'Lena Fischer',  email: 'lena@kindred.app',   avatar: '🕯️', role: 'member', profile: 'maker'     },
  { team: 'Meridian Design',name: 'Yusuf Karim',   email: 'yusuf@kindred.app',  avatar: '✏️', role: 'lead',   profile: 'connector' },
  { team: 'Meridian Design',name: 'Hana Sato',     email: 'hana@kindred.app',   avatar: '🌸', role: 'member', profile: 'steady'    },
  { team: 'Meridian Design',name: 'Rob Ellis',     email: 'rob@kindred.app',    avatar: '🧭', role: 'member', profile: 'drifting'  }
];

const PROFILES = {
  connector: { perDay: [1, 4], social: 0.75, morningTalk: 0.62, baseMood: 2.9, gaps: 0.06, dip: 0 },
  steady:    { perDay: [1, 3], social: 0.45, morningTalk: 0.38, baseMood: 2.8, gaps: 0.12, dip: 0 },
  // Tomas and Lena have pulled inward over the last few days — that dip is what
  // the team layer is supposed to notice before a human does.
  maker:     { perDay: [1, 3], social: 0.34, morningTalk: 0.24, baseMood: 2.7, gaps: 0.15, dip: 5 },
  drifting:  { perDay: [0, 2], social: 0.2,  morningTalk: 0.14, baseMood: 2.4, gaps: 0.3,  dip: 7 }
};

function seedMomentsFor(user, profile) {
  const p = PROFILES[profile];
  const insert = db.prepare(`INSERT INTO moments
    (user_id, ritual_key, label, sense, kind, meaning, mood, company, invested, note, reframe, source, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'seed',?)`);

  for (let d = 20; d >= 0; d--) {
    const date = new Date(Date.now() - d * DAY);
    const weekend = [0, 6].includes(date.getDay());
    const inDip = d < p.dip;                 // the recent withdrawal window
    const social = inDip ? p.social * 0.15 : p.social;
    // Never leave the last three days empty: the demo opens on a live streak.
    if (d > 3 && (chance(p.gaps) || (weekend && chance(0.55)))) continue;

    const hasMorningTalk = chance(inDip ? p.morningTalk * 0.3 : p.morningTalk);
    const wednesday = date.getDay() === 3;
    const keys = [];
    if (hasMorningTalk) keys.push('morning_talk');
    if (chance(0.6)) keys.push(chance(social) ? 'coffee_with' : 'quiet_coffee');
    if (chance(social) || (wednesday && !inDip && chance(0.85))) keys.push(wednesday ? 'shared_lunch' : pick(['shared_lunch', 'tea_break']));
    if (chance(inDip ? 0.25 : 0.45)) keys.push('walk');
    if (chance(0.45)) keys.push('focus_close');
    if (chance(0.3)) keys.push(profile === 'maker' ? 'made_something' : 'token_turn');
    if (chance(0.3)) keys.push('evening_wind');
    if (chance(social * 0.6)) keys.push('gratitude');
    if (chance(0.25)) keys.push('ambient_check');

    const max = p.perDay[1];
    const chosen = [...new Set(keys)].slice(0, Math.max(p.perDay[0], Math.min(max, keys.length)));

    for (const key of chosen) {
      const r = BY_KEY[key];
      if (!r) continue;
      // The planted pattern: a morning conversation lifts the whole day.
      // The planted signal: a morning conversation lifts every later moment in
      // that day, and Wednesday's shared table lifts it again.
      const lift =
        (hasMorningTalk ? 1.5 : 0) +
        (r.kind === 'social' ? 0.6 : 0) +
        (wednesday && r.kind === 'social' ? 0.6 : 0) +
        (weekend ? 0.2 : 0) -
        (inDip ? 0.6 : 0);
      const mood = Math.max(1, Math.min(5, Math.round(p.baseMood + lift + (rnd() - 0.5) * 0.8)));
      const hour = key === 'morning_talk' ? 8 + Math.floor(rnd() * 2)
        : key === 'evening_wind' ? 20 + Math.floor(rnd() * 2)
        : key.includes('lunch') ? 12 + Math.floor(rnd() * 2)
        : 9 + Math.floor(rnd() * 9);
      const at = new Date(date);
      at.setHours(hour, Math.floor(rnd() * 60), 0, 0);
      // Today's slots can land after the current clock time — pull those back so
      // the ledger never contains a moment that has not happened yet.
      if (at.getTime() > Date.now()) at.setTime(Date.now() - Math.floor(rnd() * 90 + 5) * 60000);
      const meaning = +(r.base * (0.75 + mood / 10)).toFixed(2);
      insert.run(user.id, key, r.label, r.sense, r.kind,
        meaning, mood, r.kind === 'social' ? 'with' : 'alone', r.invested,
        null, null, at.toISOString());
    }
  }
}

export function seed({ force = false } = {}) {
  // The evidence library is independent of the demo org: it is idempotent by
  // slug, survives a reseed, and never overwrites a harvested row.
  const practices = seedPractices();

  if (force) {
    db.exec('DELETE FROM sessions; DELETE FROM nudges; DELETE FROM actuations; DELETE FROM moments; DELETE FROM users; DELETE FROM teams; DELETE FROM orgs;');
  }
  if (get('SELECT count(*) AS n FROM users').n > 0) return { seeded: false, practices };

  const now = new Date().toISOString();
  run('INSERT INTO orgs (name) VALUES (?)', 'Northwind Collective');
  const orgId = get('SELECT id FROM orgs ORDER BY id DESC LIMIT 1').id;

  const teamIds = {};
  for (const name of ['Kindred Core', 'Atlas Platform', 'Harbour Support', 'Meridian Design']) {
    run('INSERT INTO teams (org_id, name) VALUES (?, ?)', orgId, name);
    teamIds[name] = get('SELECT id FROM teams ORDER BY id DESC LIMIT 1').id;
  }

  const pw = hashPassword('kindred');
  for (const person of PEOPLE) {
    run('INSERT INTO users (team_id, name, email, password_hash, role, avatar, created_at) VALUES (?,?,?,?,?,?,?)',
      teamIds[person.team], person.name, person.email, pw, person.role, person.avatar, now);
    const user = get('SELECT * FROM users WHERE email = ?', person.email);
    seedMomentsFor(user, person.profile);
  }

  // The judge account: shares Aina's team, sees everything, owns no private data.
  run('INSERT INTO users (team_id, name, email, password_hash, role, avatar, created_at) VALUES (?,?,?,?,?,?,?)',
    teamIds['Kindred Core'], 'Hackathon Judge', 'judge@kindred.app', hashPassword(process.env.JUDGE_PASSCODE || 'kindred'), 'judge', '⚖️', now);

  const counts = get('SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM moments) AS moments');
  return { seeded: true, practices, ...counts };
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  console.log(seed({ force: process.argv.includes('--force') }));
}
