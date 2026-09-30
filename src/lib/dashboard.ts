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
  const [profilesResult, segmentsResult, activeResult, plansResult] = await Promise.all([
    client.execute("SELECT * FROM profiles ORDER BY CASE id WHEN 'mama' THEN 1 WHEN 'papa' THEN 2 WHEN 'fabian' THEN 3 WHEN 'frieda' THEN 4 ELSE 5 END, name ASC"),
    client.execute(`SELECT ts.profile_id, sg.type, sg.started_at, sg.ended_at
      FROM training_segments sg JOIN training_sessions ts ON ts.id = sg.session_id`),
    client.execute(`SELECT ts.profile_id, ts.id session_id, ts.started_at session_started_at,
      sg.id segment_id, sg.type, sg.exercise_id, sg.started_at segment_started_at, ex.name exercise_name
      FROM training_sessions ts
      JOIN training_segments sg ON sg.session_id = ts.id AND sg.ended_at IS NULL
      LEFT JOIN exercises ex ON ex.id = sg.exercise_id
      WHERE ts.status = 'active'`),
    client.execute(`SELECT profile_id, title, target_date, plan_json FROM training_plans
      WHERE status = 'active' ORDER BY COALESCE(target_date, '9999-12-31') ASC`)
  ]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStartDate = new Date(todayStart);
  const weekday = weekStartDate.getDay() || 7;
  weekStartDate.setDate(weekStartDate.getDate() - weekday + 1);
  const weekStart = weekStartDate.getTime();

  return profilesResult.rows.map((row) => {
    const profileId = String(row.id);
    const profileSegments = segmentsResult.rows.filter((segment) => String(segment.profile_id) === profileId);
    let points = 0;
    let totalSeconds = 0;
    let todaySeconds = 0;
    let weekSeconds = 0;
    let strengthMinutes = 0;
    let enduranceMinutes = 0;

    for (const segment of profileSegments) {
      const start = String(segment.started_at);
      const end = asString(segment.ended_at);
      const seconds = durationSeconds(start, end);
      const type = String(segment.type) as TrainingType;
      totalSeconds += seconds;
      if (type === "strength") strengthMinutes += seconds / 60;
      else enduranceMinutes += seconds / 60;
      points += (seconds / 60) * SCORE_MULTIPLIER[type];
      const startTime = new Date(start).getTime();
      const endTime = new Date(end ?? Date.now()).getTime();
      if (endTime >= todayStart) todaySeconds += Math.max(0, (endTime - Math.max(startTime, todayStart)) / 1000);
      if (endTime >= weekStart) weekSeconds += Math.max(0, (endTime - Math.max(startTime, weekStart)) / 1000);
    }

    const active = activeResult.rows.find((entry) => String(entry.profile_id) === profileId);
    const profile: Profile = {
      id: profileId,
      name: String(row.name),
      color: String(row.color),
      avatar: String(row.avatar) as Profile["avatar"],
      startingFitness: asNumber(row.starting_fitness) || 3,
      birthDate: asString(row.birth_date),
      scoreBaseline: asNumber(row.score_baseline),
      goal: String(row.goal)
    };
    const birthTime = profile.birthDate ? new Date(profile.birthDate).getTime() : NaN;
    const age = !isNaN(birthTime)
      ? Math.floor((now.getTime() - birthTime) / (365.2425 * 24 * 60 * 60 * 1000))
      : (["fabian", "frieda"].includes(profile.id) ? 17 : 30);
    const target = movementTargetForAge(age);
    const targetActualMinutes = (target.period === "Tag" ? todaySeconds : weekSeconds) / 60;
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
        : null
    };
  });
}
