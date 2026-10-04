import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { EQUIPMENT_SEEDS, EXERCISE_SEEDS, PROFILE_SEEDS } from "@/lib/domain";

const globalDb = globalThis as typeof globalThis & {
  fitFamilyDb?: Client;
  fitFamilySchema?: Promise<void>;
};

function getClient() {
  if (!globalDb.fitFamilyDb) {
    const url = process.env.DATABASE_URL ?? "file:./data/fitfamily.db";
    if (url.startsWith("file:")) mkdirSync(path.dirname(path.resolve(url.slice(5))), { recursive: true });
    globalDb.fitFamilyDb = createClient({
      url
    });
  }
  return globalDb.fitFamilyDb;
}

async function createSchema(client: Client) {
  try {
    await client.execute("PRAGMA busy_timeout = 10000");
    await client.execute("PRAGMA journal_mode = WAL");
  } catch {
    // ignore for remote database drivers
  }

  const statements = [
    `CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      avatar TEXT NOT NULL,
      custom_avatar_data TEXT,
      email TEXT,
      starting_fitness INTEGER NOT NULL DEFAULT 1 CHECK(starting_fitness BETWEEN 1 AND 7),
      starting_fitness_stage INTEGER NOT NULL DEFAULT 1,
      birth_date TEXT,
      score_baseline REAL NOT NULL DEFAULT 0,
      score_reset_at TEXT,
      target_reset_at TEXT,
      goal TEXT NOT NULL DEFAULT 'Allgemeine Fitness',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('strength','endurance')),
      equipment TEXT NOT NULL,
      instructions TEXT,
      safety_notes TEXT,
      video_url TEXT,
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
    )`,
    `CREATE TABLE IF NOT EXISTS equipment_inventory (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 8),
      available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0,1)),
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      instructions TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS training_sessions (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL CHECK(status IN ('active','paused','completed')),
      source TEXT NOT NULL DEFAULT 'touch',
      recording_mode TEXT NOT NULL DEFAULT 'app' CHECK(recording_mode IN ('app','health')),
      external_id TEXT,
      health_title TEXT,
      health_calories REAL,
      health_distance_km REAL,
      edited INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS training_segments (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('strength','endurance')),
      exercise_id TEXT REFERENCES exercises(id),
      started_at TEXT NOT NULL,
      ended_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS training_plans (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id),
      title TEXT NOT NULL,
      goal TEXT NOT NULL,
      target_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      plan_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS health_training_tests (
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      external_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      duration_seconds REAL NOT NULL,
      source_name TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(profile_id, external_id)
    )`,
    `CREATE TABLE IF NOT EXISTS health_energy_daily (
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      active_energy_kcal REAL NOT NULL CHECK(active_energy_kcal >= 0 AND active_energy_kcal <= 20000),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(profile_id, date)
    )`,
    `CREATE TABLE IF NOT EXISTS health_workouts (
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      external_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      duration_seconds REAL NOT NULL,
      source_name TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      training_type TEXT NOT NULL CHECK(training_type IN ('strength','endurance')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(profile_id, external_id)
    )`,
    `CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      pin_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS admin_login_attempts (
      scope TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL,
      window_started_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS paired_devices (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id),
      token_hash TEXT NOT NULL UNIQUE,
      label TEXT,
      last_seen_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS handoff_tokens (
      token_hash TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id),
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      profile_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS apple_health_daily (
      profile_id TEXT NOT NULL REFERENCES profiles(id),
      date TEXT NOT NULL,
      move_calories REAL NOT NULL DEFAULT 0,
      move_goal REAL NOT NULL DEFAULT 500,
      exercise_minutes REAL NOT NULL DEFAULT 0,
      exercise_goal REAL NOT NULL DEFAULT 30,
      stand_hours REAL NOT NULL DEFAULT 0,
      stand_goal REAL NOT NULL DEFAULT 12,
      step_count INTEGER NOT NULL DEFAULT 0,
      walking_running_distance_km REAL NOT NULL DEFAULT 0,
      cycling_distance_km REAL NOT NULL DEFAULT 0,
      flights_climbed REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (profile_id, date)
    )`,
    `CREATE TABLE IF NOT EXISTS apple_health_tokens (
      profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS apple_health_ignored_workouts (
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      external_id TEXT NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (profile_id, external_id)
    )`
  ];

  await client.batch(statements.map((sql) => ({ sql })), "write");

  const healthDailyColumns = await client.execute("PRAGMA table_info(apple_health_daily)");
  const existingHealthDailyColumns = new Set(healthDailyColumns.rows.map((row) => String(row.name)));
  if (!existingHealthDailyColumns.has("step_count")) {
    await client.execute("ALTER TABLE apple_health_daily ADD COLUMN step_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!existingHealthDailyColumns.has("walking_running_distance_km")) {
    await client.execute("ALTER TABLE apple_health_daily ADD COLUMN walking_running_distance_km REAL NOT NULL DEFAULT 0");
  }
  if (!existingHealthDailyColumns.has("cycling_distance_km")) {
    await client.execute("ALTER TABLE apple_health_daily ADD COLUMN cycling_distance_km REAL NOT NULL DEFAULT 0");
  }
  if (!existingHealthDailyColumns.has("flights_climbed")) {
    await client.execute("ALTER TABLE apple_health_daily ADD COLUMN flights_climbed REAL NOT NULL DEFAULT 0");
  }
  const profileColumns = await client.execute("PRAGMA table_info(profiles)");
  const energyColumns = await client.execute("PRAGMA table_info(health_energy_daily)");
  if (!energyColumns.rows.some(row => String(row.name) === "step_count")) {
    await client.execute("ALTER TABLE health_energy_daily ADD COLUMN step_count INTEGER CHECK(step_count >= 0 AND step_count <= 200000)");
  }
  if (!profileColumns.rows.some((row) => String(row.name) === "email")) {
    await client.execute("ALTER TABLE profiles ADD COLUMN email TEXT");
  }
  if (!profileColumns.rows.some((row) => String(row.name) === "custom_avatar_data")) {
    await client.execute("ALTER TABLE profiles ADD COLUMN custom_avatar_data TEXT");
  }
  if (!profileColumns.rows.some((row) => String(row.name) === "starting_fitness")) {
    await client.execute("ALTER TABLE profiles ADD COLUMN starting_fitness INTEGER NOT NULL DEFAULT 1");
  }
  if (!profileColumns.rows.some((row) => String(row.name) === "starting_fitness_stage")) {
    await client.execute("ALTER TABLE profiles ADD COLUMN starting_fitness_stage INTEGER NOT NULL DEFAULT 1");
    await client.execute(`UPDATE profiles SET starting_fitness_stage = CASE
      WHEN birth_date IS NOT NULL THEN CASE WHEN birth_date > date('now', '-18 years') THEN MIN(starting_fitness, 3) ELSE MIN(starting_fitness + 2, 7) END
      WHEN id IN ('fabian', 'frieda') THEN MIN(starting_fitness, 3)
      ELSE MIN(starting_fitness + 2, 7) END`);
  }
  if (!profileColumns.rows.some((row) => String(row.name) === "target_reset_at")) {
    await client.execute("ALTER TABLE profiles ADD COLUMN target_reset_at TEXT");
  }

  const avatarStageMigration = await client.execute({ sql: "SELECT value FROM settings WHERE key = 'avatar_stages_start_at_one' LIMIT 1" });
  if (!avatarStageMigration.rows[0]) {
    await client.batch([
      { sql: "UPDATE profiles SET starting_fitness = 1, starting_fitness_stage = 1" },
      { sql: "INSERT INTO settings (key, value, updated_at) VALUES ('avatar_stages_start_at_one', 'true', CURRENT_TIMESTAMP)" }
    ], "write");
  }
  if (!profileColumns.rows.some((row) => String(row.name) === "score_reset_at")) {
    await client.execute("ALTER TABLE profiles ADD COLUMN score_reset_at TEXT");
  }

  const sessionColumns = await client.execute("PRAGMA table_info(training_sessions)");
  if (!sessionColumns.rows.some(row => String(row.name) === "planned_end_at")) {
    await client.execute("ALTER TABLE training_sessions ADD COLUMN planned_end_at TEXT");
  }
  if (!sessionColumns.rows.some(row => String(row.name) === "recording_mode")) {
    await client.execute("ALTER TABLE training_sessions ADD COLUMN recording_mode TEXT NOT NULL DEFAULT 'app' CHECK(recording_mode IN ('app','health'))");
  }
  if (!sessionColumns.rows.some((row) => String(row.name) === "external_id")) {
    await client.execute("ALTER TABLE training_sessions ADD COLUMN external_id TEXT");
  }
  if (!sessionColumns.rows.some((row) => String(row.name) === "health_title")) {
    await client.execute("ALTER TABLE training_sessions ADD COLUMN health_title TEXT");
  }
  if (!sessionColumns.rows.some((row) => String(row.name) === "health_calories")) {
    await client.execute("ALTER TABLE training_sessions ADD COLUMN health_calories REAL");
  }
  if (!sessionColumns.rows.some((row) => String(row.name) === "health_distance_km")) {
    await client.execute("ALTER TABLE training_sessions ADD COLUMN health_distance_km REAL");
  }
  await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS training_sessions_health_external_id
    ON training_sessions(profile_id, external_id) WHERE source = 'apple_health' AND external_id IS NOT NULL`);

  // Database guards also cover manual edits/restores and simultaneous imports.
  for (const event of ["INSERT", "UPDATE"] as const) {
    await client.execute(`CREATE TRIGGER IF NOT EXISTS health_no_overlap_${event.toLowerCase()} BEFORE ${event} ON health_workouts
      WHEN EXISTS (SELECT 1 FROM health_workouts h WHERE h.profile_id=NEW.profile_id
        AND NOT (h.profile_id=NEW.profile_id AND h.external_id=NEW.external_id)
        AND julianday(h.started_at)<julianday(NEW.ended_at) AND julianday(h.ended_at)>julianday(NEW.started_at))
      OR EXISTS (SELECT 1 FROM training_segments sg JOIN training_sessions ts ON ts.id=sg.session_id
        WHERE ts.profile_id=NEW.profile_id AND ts.recording_mode='app' AND COALESCE(ts.source,'')<>'apple_health'
        AND julianday(sg.started_at)<julianday(NEW.ended_at) AND julianday(COALESCE(sg.ended_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')))>julianday(NEW.started_at))
      BEGIN SELECT RAISE(ABORT,'Health-Training überschneidet sich mit bereits gewertetem Training.'); END`);
    await client.execute(`CREATE TRIGGER IF NOT EXISTS app_no_health_overlap_${event.toLowerCase()} BEFORE ${event} ON training_segments
      WHEN EXISTS (SELECT 1 FROM training_sessions ts JOIN health_workouts h ON h.profile_id=ts.profile_id
        WHERE ts.id=NEW.session_id AND ts.recording_mode='app' AND COALESCE(ts.source,'')<>'apple_health'
        AND julianday(NEW.started_at)<julianday(h.ended_at) AND julianday(COALESCE(NEW.ended_at,'9999-12-31'))>julianday(h.started_at))
      BEGIN SELECT RAISE(ABORT,'App-Training überschneidet sich mit gebuchtem Health-Training.'); END`);
  }
  await client.execute(`CREATE TRIGGER IF NOT EXISTS session_no_health_overlap BEFORE UPDATE OF recording_mode, profile_id, source ON training_sessions
    WHEN NEW.recording_mode='app' AND COALESCE(NEW.source,'')<>'apple_health' AND EXISTS (
      SELECT 1 FROM training_segments sg JOIN health_workouts h ON h.profile_id=NEW.profile_id
      WHERE sg.session_id=NEW.id AND julianday(sg.started_at)<julianday(h.ended_at)
      AND julianday(COALESCE(sg.ended_at,'9999-12-31'))>julianday(h.started_at))
    BEGIN SELECT RAISE(ABORT,'Aufzeichnungsmodus würde Training doppelt werten.'); END`);

  const equipmentColumns = await client.execute("PRAGMA table_info(equipment_inventory)");
  if (!equipmentColumns.rows.some((row) => String(row.name) === "video_url")) {
    await client.execute("ALTER TABLE equipment_inventory ADD COLUMN video_url TEXT");
  }
  if (!equipmentColumns.rows.some((row) => String(row.name) === "active")) {
    await client.execute("ALTER TABLE equipment_inventory ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
  }
  if (!equipmentColumns.rows.some((row) => String(row.name) === "instructions")) {
    await client.execute("ALTER TABLE equipment_inventory ADD COLUMN instructions TEXT");
  }
  if (!equipmentColumns.rows.some((row) => String(row.name) === "manual_pdf_url")) {
    await client.execute("ALTER TABLE equipment_inventory ADD COLUMN manual_pdf_url TEXT");
  }
  for (const column of ["manual_pdf_data", "manual_pdf_name"]) {
    if (!equipmentColumns.rows.some((row) => String(row.name) === column)) {
      await client.execute(`ALTER TABLE equipment_inventory ADD COLUMN ${column} TEXT`);
    }
  }

  const exerciseColumns = await client.execute("PRAGMA table_info(exercises)");
  if (!exerciseColumns.rows.some((row) => String(row.name) === "active")) {
    await client.execute("ALTER TABLE exercises ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
  }

  for (const profile of PROFILE_SEEDS) {
    await client.execute({
      sql: `INSERT OR IGNORE INTO profiles
        (id, name, color, avatar, starting_fitness, starting_fitness_stage, birth_date, score_baseline, goal)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [profile.id, profile.name, profile.color, profile.avatar, profile.startingFitness, profile.startingFitness, profile.birthDate, profile.scoreBaseline, profile.goal]
    });
  }

  for (const [id, name, type, equipment] of EXERCISE_SEEDS) {
    await client.execute({
      sql: "INSERT OR IGNORE INTO exercises (id, name, type, equipment) VALUES (?, ?, ?, ?)",
      args: [id, name, type, equipment]
    });
  }

  for (const [id, name, quantity] of EQUIPMENT_SEEDS) {
    await client.execute({
      sql: "INSERT OR IGNORE INTO equipment_inventory (id, name, quantity) VALUES (?, ?, ?)",
      args: [id, name, quantity]
    });
  }

  const defaults: Record<string, string> = {
    app_name: "FitFamily Dashboard",
    weather_postcode: "91572",
    weather_place: "Bechhofen",
    quiet_start: "22:30",
    quiet_end: "06:30",
    setup_complete: "false"
  };

  for (const [key, value] of Object.entries(defaults)) {
    await client.execute({
      sql: "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
      args: [key, value]
    });
  }
}

export async function db() {
  const client = getClient();
  globalDb.fitFamilySchema ??= createSchema(client);
  await globalDb.fitFamilySchema;
  return client;
}

export async function getSetting(key: string) {
  const client = await db();
  const result = await client.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: [key] });
  return result.rows[0] ? String(result.rows[0].value) : null;
}

export function asString(value: unknown) {
  return value == null ? null : String(value);
}

export function asNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}
