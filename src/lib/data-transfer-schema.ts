// The import envelope may contain one 10 MiB PDF as base64 (~13.4 MiB) plus
// the regular database export. Keep a bounded 20 MiB request limit.
export const MAX_DATA_IMPORT_BYTES = 20 * 1024 * 1024;
export const DATA_TABLE_SPECS = {
  profiles: {
    columns: ["id", "name", "email", "color", "avatar", "custom_avatar_data", "starting_fitness", "starting_fitness_stage", "birth_date", "score_baseline", "score_reset_at", "target_reset_at", "goal", "created_at", "updated_at"],
    keys: ["id"],
    required: ["id", "name", "color", "avatar"]
  },
  exercises: {
    columns: ["id", "name", "type", "equipment", "instructions", "safety_notes", "video_url", "active"],
    keys: ["id"],
    required: ["id", "name", "type", "equipment"]
  },
  equipment_inventory: {
    columns: ["id", "name", "quantity", "available", "active", "created_at", "updated_at", "video_url", "instructions", "manual_pdf_url", "manual_pdf_data", "manual_pdf_name"],
    keys: ["id"],
    required: ["id", "name"]
  },
  training_sessions: {
    columns: ["id", "profile_id", "started_at", "ended_at", "status", "source", "recording_mode", "planned_end_at", "external_id", "health_title", "health_calories", "health_distance_km", "edited", "created_at"],
    keys: ["id"],
    required: ["id", "profile_id", "started_at", "status"]
  },
  training_segments: {
    columns: ["id", "session_id", "type", "exercise_id", "started_at", "ended_at"],
    keys: ["id"],
    required: ["id", "session_id", "type", "started_at"]
  },
  training_plans: {
    columns: ["id", "profile_id", "title", "goal", "target_date", "status", "plan_json", "created_at", "updated_at"],
    keys: ["id"],
    required: ["id", "profile_id", "title", "goal", "plan_json"]
  },
  apple_health_daily: {
    columns: ["profile_id", "date", "move_calories", "move_goal", "exercise_minutes", "exercise_goal", "stand_hours", "stand_goal", "step_count", "walking_running_distance_km", "cycling_distance_km", "flights_climbed", "updated_at"],
    keys: ["profile_id", "date"],
    required: ["profile_id", "date"]
  },
  apple_health_ignored_workouts: {
    columns: ["profile_id", "external_id", "deleted_at"],
    keys: ["profile_id", "external_id"],
    required: ["profile_id", "external_id"]
  },
  settings: {
    columns: ["key", "value", "updated_at"],
    keys: ["key"],
    required: ["key", "value"]
  },
  health_workouts: {
    columns: ["profile_id", "external_id", "started_at", "ended_at", "duration_seconds", "source_name", "activity_type", "training_type", "created_at", "edited", "deleted_at"],
    keys: ["profile_id", "external_id"],
    required: ["profile_id", "external_id", "started_at", "ended_at", "duration_seconds", "source_name", "activity_type", "training_type"]
  },
  health_training_tests: {
    columns: ["profile_id", "external_id", "started_at", "ended_at", "duration_seconds", "source_name", "activity_type", "created_at"],
    keys: ["profile_id", "external_id"],
    required: ["profile_id", "external_id", "started_at", "ended_at", "duration_seconds", "source_name", "activity_type"]
  },
  health_energy_daily: {
    columns: ["profile_id", "date", "active_energy_kcal", "step_count", "training_minutes", "source_name", "updated_at"],
    keys: ["profile_id", "date"],
    required: ["profile_id", "date", "active_energy_kcal"]
  }
} as const;

export type DataTransferTable = keyof typeof DATA_TABLE_SPECS;
export const DATA_TRANSFER_TABLES = Object.keys(DATA_TABLE_SPECS) as DataTransferTable[];
export const DATA_IMPORT_ORDER: DataTransferTable[] = ["profiles", "exercises", "equipment_inventory", "training_sessions", "training_plans", "training_segments", "apple_health_daily", "apple_health_ignored_workouts", "health_training_tests", "health_workouts", "health_energy_daily", "settings"];

const PRIVATE_SETTING_KEYS = new Set(["admin_pin_hash", "nas_backup_key", "nas_backup_path", "health_training_family_key_hash"]);

export function isPortableSetting(key: string) {
  return !PRIVATE_SETTING_KEYS.has(key) && !key.startsWith("ai_key_");
}
