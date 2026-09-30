export type NormalizedSession = {
  date?: string;
  title: string;
  type: "strength" | "endurance";
  minutes: number;
  distanceKm?: number;
  exercises: string[];
};

export type NormalizedWeek = {
  week: number;
  sessions: NormalizedSession[];
};

export type NormalizedPlan = {
  summary: string;
  provider?: string;
  target_date?: string | null;
  weeks: NormalizedWeek[];
};

function inferType(title?: string | null, rawType?: string | null): "strength" | "endurance" {
  const t = String(rawType || "").toLowerCase();
  if (t === "strength" || t === "kraft" || t === "krafttraining") return "strength";
  if (t === "endurance" || t === "ausdauer" || t === "cardio") return "endurance";

  const titleLower = String(title || "").toLowerCase();
  const strengthKeywords = [
    "kraft", "hantel", "gym", "liegestütz", "klimmzug", "core", "rumpf", "rücken",
    "stabi", "stabilisation", "yoga", "pilates", "functional", "strength", "bauch",
    "muskel", "pull", "push", "beine", "brust", "schulter", "ganzkörper"
  ];
  for (const kw of strengthKeywords) {
    if (titleLower.includes(kw)) return "strength";
  }
  return "endurance";
}

function parseExercises(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        return String(obj.name ?? obj.title ?? obj.uebung ?? obj.exercise ?? Object.values(obj)[0] ?? "");
      }
      return String(item ?? "").trim();
    }).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(/[,;\n•·]+/).map((s) => s.trim()).filter(Boolean);
  }
  return ["Übungen nach Plan"];
}

/**
 * Normalisiert beliebige JSON-Strukturen von KI-Anbietern (OpenAI, Gemini),
 * manuellen Importen oder Altbeständen in ein einheitliches, darstellbares Schema.
 */
export function normalizePlanJson(rawInput: unknown, defaultMinutes = 30): NormalizedPlan {
  if (!rawInput || typeof rawInput !== "object") {
    return {
      summary: "Persönlicher Trainingsplan",
      weeks: []
    };
  }

  let root = rawInput as Record<string, unknown>;

  // Unwrap common wrapper keys like "trainingsplan", "plan", "data"
  if (root.trainingsplan && typeof root.trainingsplan === "object") {
    root = { ...root, ...(root.trainingsplan as Record<string, unknown>) };
  } else if (root.plan && typeof root.plan === "object" && !Array.isArray(root.plan)) {
    root = { ...root, ...(root.plan as Record<string, unknown>) };
  }

  const summary = String(root.summary ?? root.zusammenfassung ?? root.beschreibung ?? root.description ?? "Persönlicher Trainingsplan");
  const provider = root.provider ? String(root.provider) : undefined;
  const targetDate = root.targetDate || root.target_date ? String(root.targetDate || root.target_date) : null;

  // Extract raw weeks array from various possible keys
  const rawWeeks = Array.isArray(root.weeks)
    ? root.weeks
    : Array.isArray(root.wochen)
      ? root.wochen
      : Array.isArray(root.schedule)
        ? root.schedule
        : Array.isArray(root.plan)
          ? root.plan
          : null;

  const normalizedWeeks: NormalizedWeek[] = [];

  if (rawWeeks && rawWeeks.length > 0) {
    for (let wIndex = 0; wIndex < rawWeeks.length; wIndex++) {
      const rawWeek = rawWeeks[wIndex];
      if (!rawWeek || typeof rawWeek !== "object") continue;

      const weekObj = rawWeek as Record<string, unknown>;
      const weekNumber = Number(weekObj.week ?? weekObj.woche ?? weekObj.number ?? wIndex + 1);

      // Extract sessions from week
      const rawSessions = Array.isArray(weekObj.sessions)
        ? weekObj.sessions
        : Array.isArray(weekObj.einheiten)
          ? weekObj.einheiten
          : Array.isArray(weekObj.tage)
            ? weekObj.tage
            : Array.isArray(weekObj.days)
              ? weekObj.days
              : Array.isArray(weekObj.workouts)
                ? weekObj.workouts
                : Array.isArray(weekObj.trainings)
                  ? weekObj.trainings
                  : null;

      const sessions: NormalizedSession[] = [];

      if (rawSessions && rawSessions.length > 0) {
        for (const rawSession of rawSessions) {
          if (!rawSession || typeof rawSession !== "object") continue;
          const sObj = rawSession as Record<string, unknown>;
          const title = String(sObj.title ?? sObj.titel ?? sObj.name ?? sObj.tag ?? sObj.day ?? "Trainingseinheit");
          const type = inferType(title, String(sObj.type ?? sObj.art ?? sObj.kategorie ?? ""));
          const minutes = Math.max(5, Number(sObj.minutes ?? sObj.dauer ?? sObj.duration ?? sObj.zeit ?? defaultMinutes) || defaultMinutes);
          const distanceKm = sObj.distanceKm ? Number(sObj.distanceKm) : undefined;
          const date = sObj.date ? String(sObj.date) : undefined;
          const exercises = parseExercises(sObj.exercises ?? sObj.uebungen ?? sObj.workouts);

          sessions.push({
            title,
            type,
            minutes,
            distanceKm,
            date,
            exercises: exercises.length > 0 ? exercises : ["Ganzkörperübungen"]
          });
        }
      }

      if (sessions.length > 0) {
        normalizedWeeks.push({
          week: weekNumber,
          sessions
        });
      }
    }
  }

  // Fallback: If no weeks array was found, check if root has flat sessions/einheiten
  if (normalizedWeeks.length === 0) {
    const flatSessions = Array.isArray(root.sessions)
      ? root.sessions
      : Array.isArray(root.einheiten)
        ? root.einheiten
        : null;

    if (flatSessions && flatSessions.length > 0) {
      const sessions: NormalizedSession[] = flatSessions.map((s) => {
        const sObj = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
        const title = String(sObj.title ?? sObj.titel ?? sObj.name ?? "Trainingseinheit");
        return {
          title,
          type: inferType(title, String(sObj.type ?? sObj.art ?? "")),
          minutes: Math.max(5, Number(sObj.minutes ?? sObj.dauer ?? defaultMinutes) || defaultMinutes),
          exercises: parseExercises(sObj.exercises ?? sObj.uebungen)
        };
      });

      normalizedWeeks.push({
        week: 1,
        sessions
      });
    }
  }

  return {
    summary,
    provider,
    target_date: targetDate,
    weeks: normalizedWeeks
  };
}
