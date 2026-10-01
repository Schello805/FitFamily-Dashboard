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

// Umfassendes Wörterbuch zur Übersetzung englischer Fitness- und Übungsbegriffe ins Deutsche
const FITNESS_TRANSLATIONS: Record<string, string> = {
  // Einheitentitel & Typen
  "full body workout": "Ganzkörpertraining",
  "full body strength": "Ganzkörper-Krafttraining",
  "full body": "Ganzkörper",
  "upper body workout": "Oberkörpertraining",
  "upper body strength": "Oberkörper-Krafttraining",
  "upper body": "Oberkörper",
  "lower body workout": "Unterkörpertraining",
  "lower body strength": "Unterkörper-Krafttraining",
  "lower body": "Unterkörper",
  "core workout": "Rumpf- & Bauchtraining",
  "core & abs": "Rumpf & Bauch",
  "core training": "Rumpftraining",
  "core session": "Rumpfeinheit",
  "core": "Rumpf & Bauch",
  "cardio session": "Ausdauereinheit",
  "cardio workout": "Ausdauertraining",
  "cardio": "Ausdauer",
  "strength session": "Krafteinheit",
  "strength workout": "Krafttraining",
  "strength training": "Krafttraining",
  "strength": "Krafttraining",
  "endurance session": "Ausdauereinheit",
  "endurance workout": "Ausdauertraining",
  "endurance": "Ausdauer",
  "active recovery": "Aktive Erholung",
  "recovery": "Erholung",
  "rest day": "Ruhetag",
  "leg day": "Beintraining",
  "push day": "Druckübungen (Brust, Schulter, Trizeps)",
  "pull day": "Zugübungen (Rücken, Bizeps)",
  "chest & triceps": "Brust & Trizeps",
  "back & biceps": "Rücken & Bizeps",
  "legs & core": "Beine & Rumpf",
  "hiit session": "HIIT-Intervalltraining",
  "hiit workout": "HIIT-Intervalltraining",
  "hiit": "HIIT",
  "morning run": "Morgenlauf",
  "evening run": "Abendlauf",
  "interval run": "Intervalllauf",
  "long run": "Langer Dauerlauf",
  "recovery walk": "Regenerationsspaziergang",
  "mobility & stretching": "Beweglichkeit & Dehnen",
  "mobility": "Beweglichkeit",
  "warm-up": "Aufwärmen",
  "warm up": "Aufwärmen",
  "cool-down": "Abwärmen & Dehnen",
  "cool down": "Abwärmen & Dehnen",

  // Übungen
  "squats": "Kniebeugen",
  "squat": "Kniebeuge",
  "bodyweight squats": "Kniebeugen (Eigengewicht)",
  "jump squats": "Sprungkniebeugen",
  "push-ups": "Liegestütze",
  "push-up": "Liegestütz",
  "push ups": "Liegestütze",
  "pushups": "Liegestütze",
  "knee push-ups": "Liegestütze auf Knien",
  "pull-ups": "Klimmzüge",
  "pull-up": "Klimmzug",
  "pull ups": "Klimmzüge",
  "chin-ups": "Klimmzüge im Untergriff",
  "plank": "Unterarmstütz (Plank)",
  "planks": "Unterarmstütz (Plank)",
  "side plank": "Seitstütz",
  "lunges": "Ausfallschritte",
  "lunge": "Ausfallschritt",
  "walking lunges": "Gehende Ausfallschritte",
  "jumping jacks": "Hampelmänner",
  "burpees": "Burpees (Liegestützsprünge)",
  "mountain climbers": "Bergsteiger (Mountain Climbers)",
  "crunches": "Bauchpressen (Crunches)",
  "crunch": "Bauchpresse",
  "sit-ups": "Sit-ups (Rumpfbeugen)",
  "sit ups": "Sit-ups (Rumpfbeugen)",
  "sit-up": "Sit-up",
  "leg raises": "Beinheben",
  "leg raise": "Beinheben",
  "lying leg raises": "Liegendes Beinheben",
  "hanging leg raises": "Hängendes Beinheben",
  "russian twists": "Russische Drehungen (Russian Twists)",
  "bicycle crunches": "Fahrrad-Crunches",
  "glute bridge": "Beckenheben (Glute Bridge)",
  "glute bridges": "Beckenheben (Glute Bridges)",
  "bench press": "Bankdrücken",
  "dumbbell bench press": "Kurzhantel-Bankdrücken",
  "deadlift": "Kreuzheben",
  "deadlifts": "Kreuzheben",
  "bicep curls": "Bizepscurls",
  "biceps curls": "Bizepscurls",
  "tricep dips": "Trizeps-Dips",
  "dips": "Barrenstütz (Dips)",
  "shoulder press": "Schulterdrücken",
  "overhead press": "Überkopfdrücken",
  "lateral raises": "Seitheben",
  "lat pulldown": "Latzug",
  "lat pulldowns": "Latzug",
  "lat pull-down": "Latzug",
  "butterfly": "Butterfly (Brustpresse)",
  "chest fly": "Fliegende Bewegung (Brust)",
  "treadmill": "Laufband",
  "treadmill run": "Laufband-Lauf",
  "running": "Laufen / Joggen",
  "jogging": "Joggen",
  "cycling": "Radfahren",
  "indoor cycling": "Fahrradergometer",
  "stationary bike": "Fahrradergometer",
  "bike": "Fahrradergometer",
  "vibration plate": "Vibrationsplatte",
  "punching bag": "Boxsack",
  "heavy bag": "Boxsack-Training",
  "shadow boxing": "Schattenboxen",
  "jump rope": "Seilspringen",
  "skipping rope": "Seilspringen",
  "rowing": "Rudern",
  "stretching": "Dehnen & Beweglichkeit"
};

// Sortierte Keys nach Länge absteigend für präzise Phrase-Replacements
const SORTED_KEYS = Object.keys(FITNESS_TRANSLATIONS).sort((a, b) => b.length - a.length);

/**
 * Übersetzt englische Fitness-Begriffe, Einheitstitel und Übungen zuverlässig ins Deutsche.
 */
export function translateFitnessTerm(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  // Direkter exakter Treffer
  if (FITNESS_TRANSLATIONS[lower]) {
    return FITNESS_TRANSLATIONS[lower];
  }

  // Ersetzung von Phrasen / Wortbestandteilen (z.B. "3x12 Push-ups" -> "3x12 Liegestütze")
  let result = trimmed;
  for (const english of SORTED_KEYS) {
    const german = FITNESS_TRANSLATIONS[english];
    const escaped = english.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    if (regex.test(result)) {
      result = result.replace(regex, german);
    }
  }

  return result;
}

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
  let list: string[] = [];
  if (Array.isArray(raw)) {
    list = raw.map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        return String(obj.name ?? obj.title ?? obj.uebung ?? obj.exercise ?? Object.values(obj)[0] ?? "");
      }
      return String(item ?? "").trim();
    }).filter(Boolean);
  } else if (typeof raw === "string" && raw.trim()) {
    list = raw.split(/[,;\n•·]+/).map((s) => s.trim()).filter(Boolean);
  }

  if (list.length === 0) {
    return ["Übungen nach Plan"];
  }

  return list.map((ex) => translateFitnessTerm(ex));
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

  const rawSummary = String(root.summary ?? root.zusammenfassung ?? root.beschreibung ?? root.description ?? "Persönlicher Trainingsplan");
  const summary = translateFitnessTerm(rawSummary);
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
          const rawTitle = String(sObj.title ?? sObj.titel ?? sObj.name ?? sObj.tag ?? sObj.day ?? "Trainingseinheit");
          const title = translateFitnessTerm(rawTitle);
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
        const rawTitle = String(sObj.title ?? sObj.titel ?? sObj.name ?? "Trainingseinheit");
        const title = translateFitnessTerm(rawTitle);
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
