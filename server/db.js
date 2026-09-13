import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'kindred.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS orgs (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id     INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id),
  name   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  team_id       INTEGER REFERENCES teams(id),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',   -- member | lead | judge
  avatar        TEXT NOT NULL DEFAULT '🙂',
  created_at    TEXT NOT NULL
);

-- One row per logged ritual. This is the ledger.
CREATE TABLE IF NOT EXISTS moments (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  ritual_key TEXT NOT NULL,
  label      TEXT NOT NULL,
  sense      TEXT NOT NULL,        -- sight | hearing | touch | smell | taste
  kind       TEXT NOT NULL,        -- solo | social | physical | reflective
  meaning    REAL NOT NULL,        -- currency earned
  mood       INTEGER NOT NULL,     -- 1..5 self-report
  company    TEXT NOT NULL DEFAULT 'alone', -- alone | with
  invested   INTEGER NOT NULL DEFAULT 0,    -- costs energy now, pays meaning later
  note       TEXT,
  reframe    TEXT,
  source     TEXT NOT NULL DEFAULT 'app',   -- app | token | slack | seed
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moments_user_time ON moments(user_id, created_at);

-- Every physical-world side effect the agent asked for.
CREATE TABLE IF NOT EXISTS actuations (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  sense      TEXT NOT NULL,
  device     TEXT NOT NULL,        -- lamp | chime | token | diffuser | kettle
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL
);

-- Agent messages: reframes, ritual prompts, team nudges.
CREATE TABLE IF NOT EXISTS nudges (
  id          INTEGER PRIMARY KEY,
  scope       TEXT NOT NULL,       -- personal | team | org
  team_id     INTEGER REFERENCES teams(id),
  user_id     INTEGER REFERENCES users(id),
  audience    TEXT,                -- comma separated names, for team nudges
  channel     TEXT NOT NULL,       -- app | slack
  kind        TEXT NOT NULL,       -- reframe | prompt | invite | statement
  text        TEXT NOT NULL,
  engine      TEXT NOT NULL DEFAULT 'local', -- local | openai
  accepted    INTEGER,
  delivered   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

-- ------------------------------------------------------------ daily check-in
-- One conversation per user per local day. The chat the app opens with.
CREATE TABLE IF NOT EXISTS checkins (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  day        TEXT NOT NULL,               -- YYYY-MM-DD, the user's local day
  mood       INTEGER,                     -- 1..5, read out of the answers
  energy     TEXT,                        -- flat | steady | wired
  social     TEXT,                        -- toward | neutral | away
  themes     TEXT NOT NULL DEFAULT '',    -- csv of detected themes
  intent     TEXT,                        -- what they said they feel like doing
  summary    TEXT,                        -- the agent's one-line read-back
  voice      INTEGER NOT NULL DEFAULT 0,  -- did any answer arrive by voice
  completed  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, day)
);

-- Every answer, kept verbatim. This is the log the user asked for.
CREATE TABLE IF NOT EXISTS checkin_answers (
  id           INTEGER PRIMARY KEY,
  checkin_id   INTEGER NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  question_key TEXT NOT NULL,
  question     TEXT NOT NULL,
  answer       TEXT NOT NULL,
  modality     TEXT NOT NULL DEFAULT 'text',  -- text | voice | choice
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_answers_checkin ON checkin_answers(checkin_id, seq);

-- Evidence-backed actions harvested from quality sources. Every row carries
-- its source: nothing is recommended that cannot be traced back to a citation.
CREATE TABLE IF NOT EXISTS practices (
  id               INTEGER PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  action           TEXT NOT NULL,          -- the imperative: what to actually do
  rationale        TEXT,                   -- one line of why it works
  ritual_key       TEXT,                   -- maps the action back into the ledger
  sense            TEXT,
  kind             TEXT,                   -- solo | social | physical | reflective
  minutes          INTEGER NOT NULL DEFAULT 5,
  steps            TEXT NOT NULL DEFAULT '[]',   -- JSON array: how to actually do it
  tags             TEXT NOT NULL DEFAULT '',
  source_title     TEXT NOT NULL,
  source_publisher TEXT NOT NULL,
  source_url       TEXT NOT NULL,
  source_date      TEXT,
  evidence         TEXT NOT NULL DEFAULT 'review', -- rct | study | review | guidance | editorial
  credibility      REAL NOT NULL DEFAULT 0.5,
  snippet          TEXT,                   -- the sentence the claim rests on
  link_status      TEXT NOT NULL DEFAULT 'unchecked', -- unchecked | ok | blocked | dead
  engine           TEXT NOT NULL DEFAULT 'curated',   -- curated | exa
  harvested_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_practices_tags ON practices(tags);

-- A practice can rest on more than one citation: the primary study, plus a
-- readable write-up from a publisher a person would actually open. Both are
-- stored, so the app can show the plain-English source and still prove the
-- claim traces to primary research.
CREATE TABLE IF NOT EXISTS practice_sources (
  id          INTEGER PRIMARY KEY,
  practice_id INTEGER NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'supporting', -- primary | readable | supporting
  title       TEXT NOT NULL,
  publisher   TEXT NOT NULL,
  url         TEXT NOT NULL,
  published   TEXT,
  evidence    TEXT NOT NULL DEFAULT 'review',
  credibility REAL NOT NULL DEFAULT 0.5,
  snippet     TEXT,
  link_status TEXT NOT NULL DEFAULT 'unchecked', -- unchecked | ok | blocked | dead
  created_at  TEXT NOT NULL,
  UNIQUE (practice_id, url)
);
CREATE INDEX IF NOT EXISTS idx_sources_practice ON practice_sources(practice_id, role);

-- What the agent recommended, and whether it was taken.
CREATE TABLE IF NOT EXISTS recommendations (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  checkin_id  INTEGER REFERENCES checkins(id) ON DELETE CASCADE,
  practice_id INTEGER NOT NULL REFERENCES practices(id),
  rank        INTEGER NOT NULL DEFAULT 0,
  reason      TEXT,                        -- why this person, today
  accepted    INTEGER,
  moment_id   INTEGER REFERENCES moments(id),
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recs_user ON recommendations(user_id, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
`);

// Columns added after a database already exists in the wild. CREATE TABLE IF
// NOT EXISTS will not backfill them, so each one is added here if missing.
const MIGRATIONS = [
  ['practices', 'steps', "TEXT NOT NULL DEFAULT '[]'"]
];

for (const [table, column, decl] of MIGRATIONS) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

export const q = (sql) => db.prepare(sql);
export const all = (sql, ...args) => db.prepare(sql).all(...args);
export const get = (sql, ...args) => db.prepare(sql).get(...args);
export const run = (sql, ...args) => db.prepare(sql).run(...args);
