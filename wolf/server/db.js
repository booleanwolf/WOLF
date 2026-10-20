import pg from 'pg';
import { config } from './config.js';

// Keep DATE columns as 'YYYY-MM-DD' strings instead of shifting them through the server's time zone.
pg.types.setTypeParser(1082, (v) => v);

const ssl = config.databaseCaCert
  ? { ca: config.databaseCaCert, rejectUnauthorized: true }
  : config.databaseSsl
    ? { rejectUnauthorized: false }
    : undefined;

// pg treats sslmode in the URL as authoritative and would override our ssl object.
const connectionString = config.databaseUrl.replace(/[?&]sslmode=[^&]+/, '');

export const pool = new pg.Pool({ connectionString, ssl, max: 5 });
pool.on('error', (err) => console.error('[db]', err.message));

export const query = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function migrate() {
  await query(`
    CREATE SCHEMA IF NOT EXISTS wolf;

    -- A project, a piece of research or an academic course. Steps are the optional stage line shown on top.
    CREATE TABLE IF NOT EXISTS wolf.entities (
      id          SERIAL PRIMARY KEY,
      category    TEXT NOT NULL CHECK (category IN ('project', 'research', 'academic')),
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color       TEXT NOT NULL DEFAULT '#2e6a57',
      status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'done', 'archived')),
      steps       JSONB NOT NULL DEFAULT '[]',
      step_index  INTEGER NOT NULL DEFAULT 0,
      due_date    DATE,
      thumb       BYTEA,
      thumb_type  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Tasks belong to an entity; a subtask points at its top-level parent.
    CREATE TABLE IF NOT EXISTS wolf.tasks (
      id         SERIAL PRIMARY KEY,
      entity_id  INTEGER NOT NULL REFERENCES wolf.entities(id) ON DELETE CASCADE,
      parent_id  INTEGER REFERENCES wolf.tasks(id) ON DELETE CASCADE,
      step_id    TEXT,
      title      TEXT NOT NULL,
      notes      TEXT NOT NULL DEFAULT '',
      done       BOOLEAN NOT NULL DEFAULT FALSE,
      priority   TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
      due_date   DATE,
      position   INTEGER NOT NULL DEFAULT 0,
      done_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS tasks_entity_idx ON wolf.tasks (entity_id, parent_id, position);

    -- Research: papers collected for the literature review.
    CREATE TABLE IF NOT EXISTS wolf.papers (
      id         SERIAL PRIMARY KEY,
      entity_id  INTEGER NOT NULL REFERENCES wolf.entities(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      url        TEXT NOT NULL DEFAULT '',
      authors    TEXT NOT NULL DEFAULT '',
      year       INTEGER,
      venue      TEXT NOT NULL DEFAULT '',
      status     TEXT NOT NULL DEFAULT 'to_read' CHECK (status IN ('to_read', 'reading', 'read')),
      notes      TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS papers_entity_idx ON wolf.papers (entity_id);

    -- Academic: weekly class and lab times. weekday 0 = Sunday. Times are 'HH:MM'.
    CREATE TABLE IF NOT EXISTS wolf.class_slots (
      id         SERIAL PRIMARY KEY,
      entity_id  INTEGER NOT NULL REFERENCES wolf.entities(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL CHECK (kind IN ('class', 'lab')),
      weekday    SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      start_time TEXT NOT NULL,
      end_time   TEXT NOT NULL,
      location   TEXT NOT NULL DEFAULT '',
      note       TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS class_slots_entity_idx ON wolf.class_slots (entity_id);

    -- Academic: class tests with their marks.
    CREATE TABLE IF NOT EXISTS wolf.cts (
      id         SERIAL PRIMARY KEY,
      entity_id  INTEGER NOT NULL REFERENCES wolf.entities(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      date       DATE,
      time       TEXT,
      syllabus   TEXT NOT NULL DEFAULT '',
      marks      NUMERIC(6, 2),
      total      NUMERIC(6, 2) NOT NULL DEFAULT 20,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS cts_entity_idx ON wolf.cts (entity_id);

    -- Routine: things that repeat on certain weekdays (tutoring every Sun, Tue, Thu...).
    CREATE TABLE IF NOT EXISTS wolf.routines (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL,
      weekdays   SMALLINT[] NOT NULL,
      start_time TEXT,
      end_time   TEXT,
      entity_id  INTEGER REFERENCES wolf.entities(id) ON DELETE SET NULL,
      color      TEXT NOT NULL DEFAULT '#2e6a57',
      note       TEXT NOT NULL DEFAULT '',
      start_date DATE,
      end_date   DATE,
      active     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- One row per routine per day it was done.
    CREATE TABLE IF NOT EXISTS wolf.routine_checks (
      routine_id INTEGER NOT NULL REFERENCES wolf.routines(id) ON DELETE CASCADE,
      date       DATE NOT NULL,
      PRIMARY KEY (routine_id, date)
    );

    -- Files attached to an entry (PDFs, docs, slides). The bytes live in the row, like thumbnails.
    CREATE TABLE IF NOT EXISTS wolf.files (
      id         SERIAL PRIMARY KEY,
      entity_id  INTEGER NOT NULL REFERENCES wolf.entities(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      mime       TEXT NOT NULL,
      size       INTEGER NOT NULL,
      data       BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS files_entity_idx ON wolf.files (entity_id);
    -- Files are kept on the device that added them (local_key names the browser's copy). data stays
    -- empty until the user syncs the file to the server.
    ALTER TABLE wolf.files ALTER COLUMN data DROP NOT NULL;
    ALTER TABLE wolf.files ADD COLUMN IF NOT EXISTS local_key TEXT;

    -- A task or subtask can point at a file, with where to look in it ("Slide 1", "p. 12").
    ALTER TABLE wolf.tasks ADD COLUMN IF NOT EXISTS file_id INTEGER REFERENCES wolf.files(id) ON DELETE SET NULL;
    ALTER TABLE wolf.tasks ADD COLUMN IF NOT EXISTS file_ref TEXT NOT NULL DEFAULT '';

    -- Short notes on an entry. A note with remind_at shows on the dashboard once that time comes.
    CREATE TABLE IF NOT EXISTS wolf.notes (
      id         SERIAL PRIMARY KEY,
      entity_id  INTEGER NOT NULL REFERENCES wolf.entities(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      remind_at  TIMESTAMPTZ,
      done       BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS notes_entity_idx ON wolf.notes (entity_id);
    CREATE INDEX IF NOT EXISTS notes_remind_idx ON wolf.notes (remind_at) WHERE remind_at IS NOT NULL AND NOT done;

    -- One-off meetings, optionally tied to an entry.
    CREATE TABLE IF NOT EXISTS wolf.meetings (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL,
      date       DATE NOT NULL,
      start_time TEXT,
      end_time   TEXT,
      location   TEXT NOT NULL DEFAULT '',
      link       TEXT NOT NULL DEFAULT '',
      entity_id  INTEGER REFERENCES wolf.entities(id) ON DELETE SET NULL,
      notes      TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS meetings_date_idx ON wolf.meetings (date);

    -- Competitive programming. Contests first, since problems can point at the contest they came from.
    -- ext_id is the platform's own id (e.g. Codeforces contest 1850), used to avoid duplicates on import.
    CREATE TABLE IF NOT EXISTS wolf.cp_contests (
      id            SERIAL PRIMARY KEY,
      platform      TEXT NOT NULL,
      name          TEXT NOT NULL,
      url           TEXT NOT NULL DEFAULT '',
      date          DATE NOT NULL,
      start_time    TEXT,
      duration_min  INTEGER,
      rank          INTEGER,
      old_rating    INTEGER,
      new_rating    INTEGER,
      solved        INTEGER,
      total         INTEGER,
      notes         TEXT NOT NULL DEFAULT '',
      ext_id        TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS cp_contests_ext_idx ON wolf.cp_contests (platform, ext_id) WHERE ext_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS cp_contests_date_idx ON wolf.cp_contests (date);

    -- One row per problem. code is the platform's id (e.g. 1850C), so a problem is logged only once.
    CREATE TABLE IF NOT EXISTS wolf.cp_problems (
      id          SERIAL PRIMARY KEY,
      platform    TEXT NOT NULL,
      code        TEXT,
      title       TEXT NOT NULL,
      url         TEXT NOT NULL DEFAULT '',
      rating      INTEGER,
      tags        TEXT[] NOT NULL DEFAULT '{}',
      status      TEXT NOT NULL DEFAULT 'solved' CHECK (status IN ('solved', 'upsolve', 'attempted', 'todo')),
      solved_on   DATE,
      time_min    INTEGER,
      with_help   BOOLEAN NOT NULL DEFAULT FALSE,
      notes       TEXT NOT NULL DEFAULT '',
      contest_id  INTEGER REFERENCES wolf.cp_contests(id) ON DELETE SET NULL,
      source      TEXT NOT NULL DEFAULT 'manual',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS cp_problems_code_idx ON wolf.cp_problems (platform, code) WHERE code IS NOT NULL;
    CREATE INDEX IF NOT EXISTS cp_problems_solved_idx ON wolf.cp_problems (solved_on) WHERE status = 'solved';

    -- Topics to learn (the roadmap), each optionally tied to a problem tag to count practice.
    CREATE TABLE IF NOT EXISTS wolf.cp_topics (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      tag        TEXT NOT NULL DEFAULT '',
      status     TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'learning', 'done')),
      links      TEXT[] NOT NULL DEFAULT '{}',
      notes      TEXT NOT NULL DEFAULT '',
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Routine: its own time on some weekdays, e.g. { "5": { "start": "15:00", "end": "16:00" } } for Friday.
    ALTER TABLE wolf.routines ADD COLUMN IF NOT EXISTS day_times JSONB NOT NULL DEFAULT '{}';

    -- Routine: a change for one date only (another time, or skipped that day).
    CREATE TABLE IF NOT EXISTS wolf.routine_changes (
      routine_id INTEGER NOT NULL REFERENCES wolf.routines(id) ON DELETE CASCADE,
      date       DATE NOT NULL,
      start_time TEXT,
      end_time   TEXT,
      skipped    BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY (routine_id, date)
    );

    -- Tasks that need doing more than once (revise a chapter 3 times): reps ticks, reps_done of them ticked.
    -- When the columns first appear, academic tasks get 3 ticks and finished tasks stay finished.
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'wolf' AND table_name = 'tasks' AND column_name = 'reps') THEN
        ALTER TABLE wolf.tasks ADD COLUMN reps INTEGER NOT NULL DEFAULT 1 CHECK (reps BETWEEN 1 AND 20);
        ALTER TABLE wolf.tasks ADD COLUMN reps_done INTEGER NOT NULL DEFAULT 0;
        UPDATE wolf.tasks t SET reps = 3 FROM wolf.entities e WHERE e.id = t.entity_id AND e.category = 'academic';
        UPDATE wolf.tasks SET reps_done = CASE WHEN done THEN reps ELSE 0 END;
      END IF;
    END $$;

    -- Small key/value settings (Codeforces handle, daily goal...).
    CREATE TABLE IF NOT EXISTS wolf.settings (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
  `);
}
