import { asNumber, asString, db } from "@/lib/db";
import type { DashboardProfile, Profile, TrainingType } from "@/lib/domain";
import { getAvatarProgress, movementTargetForAge, SCORE_MULTIPLIER } from "@/lib/domain";
import { enforceSafetyPauses } from "@/lib/training";
import { normalizePlanJson } from "@/lib/plan-normalizer";

function durationSeconds(start: string, end: string | null) {
  return Math.max(0, (new Date(end ?? Date.now()).getTime() - new Date(start).getTime()) / 1000);
}

export async function getDashboardData(): Promise<DashboardProfile[]> {
  await enforceSafetyPauses();
  const client = await db();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStartDate = new Date(todayStart);
  const weekday = weekStartDate.getDay() || 7;
  weekStartDate.setDate(weekStartDate.getDate() - weekday + 1);
  const weekStart = weekStartDate.getTime();

  const [profilesResult, segmentsResult, activeResult, plansResult, appleHealthResult] = await Promise.all([
    client.execute("SELECT * FROM profiles ORDER BY CASE id WHEN 'mama' THEN 1 WHEN 'papa' THEN 2 WHEN 'fabian' THEN 3 WHEN 'frieda' THEN 4 ELSE 5 END, name ASC"),
    client.execute(`SELECT ts.profile_id, sg.type, sg.started_at, sg.ended_at, p.target_reset_at, p.score_reset_at
      FROM training_segments sg JOIN training_sessions ts ON ts.id = sg.session_id
      JOIN profiles p ON p.id = ts.profile_id`),
    client.execute(`SELECT ts.profile_id, ts.id session_id, ts.started_at session_started_at,
      sg.id segment_id, sg.type, sg.exercise_id, sg.started_at segment_started_at, ex.name exercise_name
      FROM training_sessions ts
      JOIN training_segments sg ON sg.session_id = ts.id AND sg.ended_at IS NULL
      LEFT JOIN exercises ex ON ex.id = sg.exercise_id
      WHERE ts.status = 'active'`),
    client.execute(`SELECT profile_id, title, target_date, plan_json FROM training_plans
      WHERE status = 'active' ORDER BY COALESCE(target_date, '9999-12-31') ASC`),
    client.execute({
      sql: "SELECT profile_id, move_calories, move_goal, exercise_minutes, exercise_goal, stand_hours, stand_goal, step_count, walking_running_distance_km, flights_climbed, updated_at FROM apple_health_daily WHERE date = ?",
      args: [todayStr]
    }).catch(() => ({ rows: [] }))
  ]);

  return profilesResult.rows.map((row) => {
    const profileId = String(row.id);
    const profileSegments = segmentsResult.rows.filter((segment) => String(segment.profile_id) === profileId);
    let points = 0;
    let totalSeconds = 0;
    let todaySeconds = 0;
    let targetTodaySeconds = 0;
    let targetWeekSeconds = 0;
    let strengthMinutes = 0;
    let enduranceMinutes = 0;

    for (const segment of profileSegments) {
      const start = String(segment.started_at);
      const end = asString(segment.ended_at);
      const seconds = durationSeconds(start, end);
      const type = String(segment.type) as TrainingType;
      const startTime = new Date(start).getTime();
      const endTime = new Date(end ?? Date.now()).getTime();
      const scoreResetAt = segment.score_reset_at ? new Date(String(segment.score_reset_at)).getTime() : Number.NEGATIVE_INFINITY;
      const scoredSeconds = Math.max(0, (endTime - Math.max(startTime, scoreResetAt)) / 1000);
      totalSeconds += seconds;
      if (type === "strength") strengthMinutes += seconds / 60;
      else enduranceMinutes += seconds / 60;
      points += (scoredSeconds / 60) * SCORE_MULTIPLIER[type];
      if (endTime >= todayStart) {
        const segSec = Math.max(0, (endTime - Math.max(startTime, todayStart)) / 1000);
        todaySeconds += segSec;
        const resetAt = row.target_reset_at ? new Date(String(row.target_reset_at)).getTime() : Number.NEGATIVE_INFINITY;
        targetTodaySeconds += Math.max(0, (endTime - Math.max(startTime, todayStart, resetAt)) / 1000);
      }
      if (endTime >= weekStart) {
        const resetAt = row.target_reset_at ? new Date(String(row.target_reset_at)).getTime() : Number.NEGATIVE_INFINITY;
        targetWeekSeconds += Math.max(0, (endTime - Math.max(startTime, weekStart, resetAt)) / 1000);
      }
    }

    const active = activeResult.rows.find((entry) => String(entry.profile_id) === profileId);
    const profile: Profile = {
      id: profileId,
      name: String(row.name),
      email: asString(row.email),
      color: String(row.color),
      avatar: String(row.avatar) as Profile["avatar"],
      startingFitness: asNumber(row.starting_fitness) || 3,
      birthDate: asString(row.birth_date),
      scoreBaseline: asNumber(row.score_baseline),
      scoreResetAt: asString(row.score_reset_at),
      targetResetAt: asString(row.target_reset_at),
      goal: String(row.goal)
    };
    const birthTime = profile.birthDate ? new Date(profile.birthDate).getTime() : NaN;
    const age = !isNaN(birthTime)
      ? Math.floor((now.getTime() - birthTime) / (365.2425 * 24 * 60 * 60 * 1000))
      : (["fabian", "frieda"].includes(profile.id) ? 17 : 30);
    const target = movementTargetForAge(age);
    const targetActualMinutes = (target.period === "Tag" ? targetTodaySeconds : targetWeekSeconds) / 60;
    const avatarProgress = getAvatarProgress(profile.startingFitness, strengthMinutes, enduranceMinutes);
    const plan = plansResult.rows.find((item) => String(item.profile_id) === profileId);
    let nextTrainingText: string | null = null;
    if (plan) {
      try {
        const rawJson = typeof plan.plan_json === "string" ? JSON.parse(plan.plan_json) : plan.plan_json;
        const planJson = normalizePlanJson(rawJson);
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        let todaySession: { title: string; minutes: number } | null = null;
        let upcomingSession: { title: string; minutes: number; date?: string } | null = null;

        if (Array.isArray(planJson.weeks)) {
          for (const week of planJson.weeks) {
            if (Array.isArray(week.sessions)) {
              for (const session of week.sessions) {
                if (session.date === todayStr) {
                  todaySession = session;
                  break;
                }
                if (session.date && session.date > todayStr) {
                  if (!upcomingSession || !upcomingSession.date || session.date < upcomingSession.date) {
                    upcomingSession = session;
                  }
                }
              }
            }
            if (todaySession) break;
          }
        }

        if (todaySession) {
          nextTrainingText = `${todaySession.title} (${todaySession.minutes} Min. heute)`;
        } else if (upcomingSession) {
          nextTrainingText = `${upcomingSession.title} (${upcomingSession.minutes} Min.)`;
        } else {
          nextTrainingText = String(plan.title);
        }
      } catch {
        nextTrainingText = String(plan.title);
      }
    }

    const storedRing = appleHealthResult.rows.find((r) => String(r.profile_id) === profileId);
    let appleHealthRings: DashboardProfile["appleHealthRings"] = null;

    if (storedRing) {
      appleHealthRings = {
        moveCalories: Math.round(Number(storedRing.move_calories)),
        moveGoal: Math.round(Number(storedRing.move_goal) || (age < 18 ? 400 : 500)),
        exerciseMinutes: Math.round(Number(storedRing.exercise_minutes)),
        exerciseGoal: Math.round(Number(storedRing.exercise_goal) || (target.period === "Tag" ? target.minutes : 30)),
        standHours: Math.min(24, Math.round(Number(storedRing.stand_hours))),
        standGoal: Math.round(Number(storedRing.stand_goal) || 12),
        stepCount: Math.max(0, Math.round(Number(storedRing.step_count) || 0)),
        walkingRunningDistanceKm: Math.max(0, Number(storedRing.walking_running_distance_km) || 0),
        flightsClimbed: Math.max(0, Math.round(Number(storedRing.flights_climbed) || 0)),
        lastSyncedAt: String(storedRing.updated_at)
      };
    }

    return {
      ...profile,
      ...avatarProgress,
      score: Math.floor(profile.scoreBaseline + points),
      totalMinutes: Math.floor(totalSeconds / 60),
      todayMinutes: Math.floor(todaySeconds / 60),
      targetPercent: Math.min(100, Math.round((targetActualMinutes / target.minutes) * 100)),
      targetMinutes: target.minutes,
      targetPeriod: target.period,
      nextTraining: nextTrainingText,
      activeTraining: active
        ? {
            sessionId: String(active.session_id),
            segmentId: String(active.segment_id),
            type: String(active.type) as TrainingType,
            exerciseId: asString(active.exercise_id),
            exerciseName: asString(active.exercise_name),
            startedAt: String(active.session_started_at),
            segmentStartedAt: String(active.segment_started_at)
          }
        : null,
      appleHealthRings
    };
  });
}
