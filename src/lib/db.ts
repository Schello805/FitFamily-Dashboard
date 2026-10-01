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
      starting_fitness INTEGER NOT NULL DEFAULT 3 CHECK(starting_fitness BETWEEN 1 AND 5),
      birth_date TEXT,
      score_baseline REAL NOT NULL DEFAULT 0,
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
      video_url TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS equipment_inventory (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 8),
      available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0,1)),
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
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (profile_id, date)
    )`
  ];

  await client.batch(statements.map((sql) => ({ sql })), "write");

  const profileColumns = await client.execute("PRAGMA table_info(profiles)");
  if (!profileColumns.rows.some((row) => String(row.name) === "starting_fitness")) {
    await client.execute("ALTER TABLE profiles ADD COLUMN starting_fitness INTEGER NOT NULL DEFAULT 3");
  }

  const equipmentColumns = await client.execute("PRAGMA table_info(equipment_inventory)");
  if (!equipmentColumns.rows.some((row) => String(row.name) === "video_url")) {
    await client.execute("ALTER TABLE equipment_inventory ADD COLUMN video_url TEXT");
  }

  for (const profile of PROFILE_SEEDS) {
    await client.execute({
      sql: `INSERT OR IGNORE INTO profiles
        (id, name, color, avatar, starting_fitness, birth_date, score_baseline, goal)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [profile.id, profile.name, profile.color, profile.avatar, profile.startingFitness, profile.birthDate, profile.scoreBaseline, profile.goal]
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
