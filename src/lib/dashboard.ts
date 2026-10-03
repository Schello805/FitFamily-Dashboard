import { asNumber, asString, db } from "@/lib/db";
import type { DashboardProfile, Profile, TrainingType } from "@/lib/domain";
import { getAvatarProgress, getFitnessStageCount, movementTargetForAge, SCORE_MULTIPLIER } from "@/lib/domain";
import { enforceSafetyPauses } from "@/lib/training";
import { normalizePlanJson } from "@/lib/plan-normalizer";

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
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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

  const [profilesResult, segmentsResult, activeResult, plansResult, appleHealthResult, trendHealthResult] = await Promise.all([
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
      sql: "SELECT profile_id, move_calories, move_goal, exercise_minutes, exercise_goal, stand_hours, stand_goal, step_count, walking_running_distance_km, cycling_distance_km, flights_climbed, updated_at FROM apple_health_daily WHERE date = ?",
      args: [todayStr]
    }).catch(() => ({ rows: [] })),
    client.execute({
      sql: "SELECT profile_id, date, exercise_minutes FROM apple_health_daily WHERE date <= ?",
      args: [todayStr]
    }).catch(() => ({ rows: [] }))
  ]);

  const healthMinutesByProfile = new Map<string, Map<string, number>>();
  for (const row of trendHealthResult.rows) {
    const profileId = String(row.profile_id);
    const dates = healthMinutesByProfile.get(profileId) ?? new Map<string, number>();
    dates.set(String(row.date), Math.max(0, asNumber(row.exercise_minutes)));
    healthMinutesByProfile.set(profileId, dates);
  }

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
        dates.set(dateKey, (dates.get(dateKey) ?? 0) + overlap / 60000);
      }
      day.setTime(nextDay.getTime());
    }
    workoutMinutesByProfile.set(profileId, dates);
  }

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
      customAvatar: Boolean(row.custom_avatar_data),
      startingFitness: asNumber(row.starting_fitness_stage) || asNumber(row.starting_fitness) || 1,
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
    const healthMinutes = healthMinutesByProfile.get(profileId);
    const workoutMinutes = workoutMinutesByProfile.get(profileId);
    const dailyTarget = target.period === "Woche" ? target.minutes / 7 : target.minutes;
    const dailyActivity = new Map<string, number>();
    for (const date of new Set([...(healthMinutes?.keys() ?? []), ...(workoutMinutes?.keys() ?? [])])) {
      const healthValue = healthMinutes?.get(date);
      const workoutValue = workoutMinutes?.get(date);
      dailyActivity.set(date, Math.max(healthValue ?? 0, workoutValue ?? 0));
    }
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
        cyclingDistanceKm: Math.max(0, Number(storedRing.cycling_distance_km) || 0),
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
      targetPercent: Math.round((targetActualMinutes / target.minutes) * 100),
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
      appleHealthRings,
      activityTrend
    };
  });
}
