import { asNumber, asString, db } from "@/lib/db";
import type { DashboardProfile, Profile, TrainingType } from "@/lib/domain";
import { getAvatarProgress, getFitnessStageCount, getProfileAge, movementTargetForAge, SCORE_MULTIPLIER } from "@/lib/domain";
import { enforceSafetyPauses } from "@/lib/training";
import { normalizePlanJson } from "@/lib/plan-normalizer";
import { trainingProgress } from "@/lib/training-progress";
import { energyDate } from "@/lib/health-energy";

function calendarDaysBetween(start: string, end: string) {
  return Math.max(0, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000));
}

function durationSeconds(start: string, end: string | null) {
  return Math.max(0, (new Date(end ?? Date.now()).getTime() - new Date(start).getTime()) / 1000);
}

export async function getDashboardData(): Promise<DashboardProfile[]> {
  await enforceSafetyPauses();
  const client = await db();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const recentDates = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(todayStart);
    date.setDate(date.getDate() - (29 - index));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  const recentStart = recentDates[0];
  const monthlyStartDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const monthlyStart = `${monthlyStartDate.getFullYear()}-${String(monthlyStartDate.getMonth() + 1).padStart(2, "0")}-01`;
  const weekStartDate = new Date(todayStart);
  const weekday = weekStartDate.getDay() || 7;
  weekStartDate.setDate(weekStartDate.getDate() - weekday + 1);
  const weekStart = weekStartDate.getTime();

  const [profilesResult, segmentsResult, activeResult, plansResult] = await Promise.all([
    client.execute("SELECT * FROM profiles ORDER BY CASE id WHEN 'mama' THEN 1 WHEN 'papa' THEN 2 WHEN 'fabian' THEN 3 WHEN 'frieda' THEN 4 ELSE 5 END, name ASC"),
    client.execute(`SELECT ts.profile_id, ts.id session_id, ts.status, sg.type, sg.started_at, sg.ended_at, p.target_reset_at, p.score_reset_at
      FROM training_segments sg JOIN training_sessions ts ON ts.id = sg.session_id
      JOIN profiles p ON p.id = ts.profile_id
      WHERE COALESCE(ts.source, '') <> 'apple_health' AND ts.recording_mode='app'
      UNION ALL SELECT h.profile_id, 'health:' || h.profile_id || ':' || h.external_id, 'completed', h.training_type, h.started_at, h.ended_at,
        p.target_reset_at, p.score_reset_at FROM health_workouts h JOIN profiles p ON p.id=h.profile_id`),
    client.execute(`SELECT ts.profile_id, ts.id session_id, ts.started_at session_started_at, ts.recording_mode,
      sg.id segment_id, sg.type, sg.exercise_id, sg.started_at segment_started_at, ex.name exercise_name, ex.equipment equipment_name
      FROM training_sessions ts
      JOIN training_segments sg ON sg.session_id = ts.id AND sg.ended_at IS NULL
      LEFT JOIN exercises ex ON ex.id = sg.exercise_id
      WHERE ts.status = 'active' AND COALESCE(ts.source, '') <> 'apple_health'`),
    client.execute(`SELECT profile_id, title, target_date, plan_json FROM training_plans
      WHERE status = 'active' ORDER BY COALESCE(target_date, '9999-12-31') ASC`)
  ]);

  const healthRows = await client.execute("SELECT profile_id, external_id, duration_seconds, started_at, ended_at FROM health_workouts");
  const healthFactors = new Map(healthRows.rows.map(h => [`health:${h.profile_id}:${h.external_id}`, Number(h.duration_seconds) / durationSeconds(String(h.started_at), String(h.ended_at))]));
  const healthActiveSeconds = new Map(healthRows.rows.map(h => [`health:${h.profile_id}:${h.external_id}`, Number(h.duration_seconds)]));
  const factorFor = (id: unknown) => healthFactors.get(String(id)) ?? 1;
  const energyRows = await client.execute({ sql: "SELECT * FROM health_energy_daily WHERE date <= ? ORDER BY date DESC", args: [energyDate(now)] });

  const workoutMinutesByProfile = new Map<string, Map<string, number>>();
  for (const row of segmentsResult.rows) {
    if (!row.ended_at) continue;
    const profileId = String(row.profile_id);
    const start = new Date(String(row.started_at));
    const end = new Date(String(row.ended_at));
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) continue;
    const dates = workoutMinutesByProfile.get(profileId) ?? new Map<string, number>();
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (day < end) {
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      const overlap = Math.max(0, Math.min(end.getTime(), nextDay.getTime()) - Math.max(start.getTime(), day.getTime()));
      if (overlap > 0) {
        const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
        dates.set(dateKey, (dates.get(dateKey) ?? 0) + overlap / 60000 * factorFor(row.session_id));
      }
      day.setTime(nextDay.getTime());
    }
    workoutMinutesByProfile.set(profileId, dates);
  }

  return profilesResult.rows.map((row) => {
    const profileId = String(row.id);
    const energy = energyRows.rows.find(entry => String(entry.profile_id) === profileId);
    const profileSegments = segmentsResult.rows.filter((segment) => String(segment.profile_id) === profileId);
    let points = 0;
    let totalSeconds = 0;
    let todaySeconds = 0;
    let targetTodaySeconds = 0;
    let targetWeekSeconds = 0;
    let strengthMinutes = 0;
    let enduranceMinutes = 0;
    let completedSeconds = 0;
    const completedSessions = new Set<string>();

    for (const segment of profileSegments) {
      const start = String(segment.started_at);
      const end = asString(segment.ended_at);
      const factor = factorFor(segment.session_id);
      const seconds = healthActiveSeconds.get(String(segment.session_id)) ?? durationSeconds(start, end);
      const type = String(segment.type) as TrainingType;
      const startTime = new Date(start).getTime();
      const endTime = new Date(end ?? Date.now()).getTime();
      const scoreResetAt = segment.score_reset_at ? new Date(String(segment.score_reset_at)).getTime() : Number.NEGATIVE_INFINITY;
      const scoredSeconds = Math.max(0, (endTime - Math.max(startTime, scoreResetAt)) / 1000) * factor;
      totalSeconds += seconds;
      if (end && String(segment.status) !== "active") {
        completedSeconds += seconds;
        if (String(segment.status) === "completed" && seconds > 0) completedSessions.add(String(segment.session_id));
      }
      if (type === "strength") strengthMinutes += seconds / 60;
      else enduranceMinutes += seconds / 60;
      points += (scoredSeconds / 60) * (String(segment.session_id).startsWith("health:") ? 1.5 : SCORE_MULTIPLIER[type]);
      if (endTime >= todayStart) {
        const segSec = Math.max(0, (endTime - Math.max(startTime, todayStart)) / 1000) * factor;
        todaySeconds += segSec;
        const resetAt = row.target_reset_at ? new Date(String(row.target_reset_at)).getTime() : Number.NEGATIVE_INFINITY;
        targetTodaySeconds += Math.max(0, (endTime - Math.max(startTime, todayStart, resetAt)) / 1000) * factor;
      }
      if (endTime >= weekStart) {
        const resetAt = row.target_reset_at ? new Date(String(row.target_reset_at)).getTime() : Number.NEGATIVE_INFINITY;
        targetWeekSeconds += Math.max(0, (endTime - Math.max(startTime, weekStart, resetAt)) / 1000) * factor;
      }
    }

    const active = activeResult.rows.find((entry) => String(entry.profile_id) === profileId);
    const profile: Profile = {
      id: profileId,
      name: String(row.name),
      email: asString(row.email),
      color: String(row.color),
      avatar: String(row.avatar) as Profile["avatar"],
      customAvatar: Boolean(row.custom_avatar_data),
      startingFitness: asNumber(row.starting_fitness_stage) || asNumber(row.starting_fitness) || 1,
      birthDate: asString(row.birth_date),
      scoreBaseline: asNumber(row.score_baseline),
      scoreResetAt: asString(row.score_reset_at),
      targetResetAt: asString(row.target_reset_at),
      goal: String(row.goal)
    };
    const age = getProfileAge(profile.id, profile.birthDate, now);
    const target = movementTargetForAge(age);
    const dailyTarget = target.period === "Woche" ? target.minutes / 7 : target.minutes;
    const dailyActivity = workoutMinutesByProfile.get(profileId) ?? new Map<string, number>();
    const observedDates = [...dailyActivity.keys()].sort();
    const firstObservedDate = observedDates[0];
    const monthlyStartMonth = new Date(monthlyStartDate.getFullYear(), monthlyStartDate.getMonth(), 1);
    const recentStartDate = new Date(`${recentStart}T00:00:00`);
    const activityTrend: DashboardProfile["activityTrend"] = [];
    const bucket = (date: string, label: string, resolution: "Tag" | "Monat" | "Jahr", start: string, end: string, periodDays: number) => {
      const values = [...dailyActivity.entries()].filter(([day]) => day >= start && day < end).map(([, minutes]) => minutes);
      return {
        date,
        label,
        resolution,
        activityMinutes: values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null,
        targetMinutes: dailyTarget,
        measuredDays: values.length,
        periodDays
      };
    };

    if (firstObservedDate && firstObservedDate < monthlyStart) {
      const firstYear = Number(firstObservedDate.slice(0, 4));
      for (let year = firstYear; year <= monthlyStartDate.getFullYear(); year += 1) {
        const start = `${year}-01-01`;
        const end = `${year + 1}-01-01`;
        const bucketEnd = end < monthlyStart ? end : monthlyStart;
        const periodDays = calendarDaysBetween(start, bucketEnd);
        activityTrend.push(bucket(start, String(year), "Jahr", start, bucketEnd, periodDays));
      }
    }

    const monthCursor = new Date(monthlyStartMonth);
    const lastMonthlyDate = new Date(recentStartDate.getFullYear(), recentStartDate.getMonth(), 1);
    while (monthCursor <= lastMonthlyDate) {
      const nextMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
      const date = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}-01`;
      const label = new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit" }).format(monthCursor);
      const nextMonthKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
      const bucketEnd = nextMonthKey < recentStart ? nextMonthKey : recentStart;
      const fullMonthDays = new Date(Date.UTC(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0)).getUTCDate();
      const periodDays = bucketEnd === nextMonthKey ? fullMonthDays : calendarDaysBetween(date, bucketEnd);
      if (date < recentStart) activityTrend.push(bucket(date, label, "Monat", date, bucketEnd, periodDays));
      monthCursor.setTime(nextMonth.getTime());
    }

    for (const date of recentDates) {
      const dateObj = new Date(`${date}T12:00:00`);
      const label = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(dateObj);
      const value = dailyActivity.get(date);
      activityTrend.push({ date, label, resolution: "Tag", activityMinutes: value === undefined ? null : Math.round(value * 10) / 10, targetMinutes: dailyTarget, measuredDays: value === undefined ? 0 : 1, periodDays: 1 });
    }
    const targetActualMinutes = (target.period === "Tag" ? targetTodaySeconds : targetWeekSeconds) / 60;
    const avatarProgress = getAvatarProgress(profile.startingFitness, strengthMinutes, enduranceMinutes, getFitnessStageCount(profile.id, profile.birthDate));
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
      healthEnergy: energy ? { date: String(energy.date), activeEnergyKcal: Number(energy.active_energy_kcal), updatedAt: String(energy.updated_at) } : null,
      ...avatarProgress,
      trainingProgress: trainingProgress(completedSeconds / 60, completedSessions.size),
      score: Math.floor(profile.scoreBaseline + points + 1e-9),
      totalMinutes: Math.floor(totalSeconds / 60 + 1e-9),
      todayMinutes: Math.floor(todaySeconds / 60 + 1e-9),
      targetPercent: Math.round((targetActualMinutes / target.minutes) * 100),
      targetMinutes: target.minutes,
      targetPeriod: target.period,
      nextTraining: nextTrainingText,
      activeTraining: active
        ? {
            sessionId: String(active.session_id),
            recordingMode: active.recording_mode === "health" ? "health" : "app",
            segmentId: String(active.segment_id),
            type: String(active.type) as TrainingType,
            exerciseId: asString(active.exercise_id),
            exerciseName: asString(active.exercise_name),
            equipmentName: asString(active.equipment_name),
            startedAt: String(active.session_started_at),
            segmentStartedAt: String(active.segment_started_at)
          }
        : null,
      activityTrend
    };
  });
}
