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

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
`);

export const q = (sql) => db.prepare(sql);
export const all = (sql, ...args) => db.prepare(sql).all(...args);
export const get = (sql, ...args) => db.prepare(sql).get(...args);
export const run = (sql, ...args) => db.prepare(sql).run(...args);
