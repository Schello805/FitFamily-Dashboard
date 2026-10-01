export type ExerciseGuide = {
  id: string;
  name: string;
  equipment: string;
  setup: string[];
  movement: string[];
  breathing: string;
  tempo: string;
  mistakes: string[];
  safety: string[];
};

export const EXERCISE_GUIDES: ExerciseGuide[] = [
  {
    id: "pull-up",
    name: "Klimmzüge",
    equipment: "Klimmzugstation",
    setup: ["Stange etwas weiter als schulterbreit greifen.", "Schultern aktiv nach unten ziehen, Rumpf und Gesäß anspannen."],
    movement: ["Brust kontrolliert zur Stange führen.", "Ellbogen nach unten und hinten ziehen.", "Langsam bis fast gestreckte Arme absenken."],
    breathing: "Beim Hochziehen ausatmen, beim Absenken einatmen.",
    tempo: "2 Sekunden hoch, kurz stabilisieren, 3 Sekunden absenken.",
    mistakes: ["Schwingen oder Schwung aus den Beinen", "Schultern zu den Ohren ziehen", "Unkontrolliert in die Gelenke fallen"],
    safety: ["Bei Schulter- oder Ellbogenschmerz sofort abbrechen.", "Kinder nur kontrolliert und nicht bis zum Muskelversagen trainieren."]
  },
  {
    id: "push-up",
    name: "Liegestütze",
    equipment: "Klimmzugstation",
    setup: ["Hände stabil und etwa schulterbreit aufsetzen.", "Kopf, Rumpf und Beine bilden eine gerade Linie."],
    movement: ["Brust kontrolliert Richtung Auflage senken.", "Ellbogen ungefähr 30–45 Grad am Körper führen.", "Den Boden kräftig wegdrücken, ohne ins Hohlkreuz zu fallen."],
    breathing: "Beim Absenken einatmen, beim Hochdrücken ausatmen.",
    tempo: "3 Sekunden absenken, 1 Sekunde hochdrücken.",
    mistakes: ["Durchhängende Hüfte", "Vorgeschobener Kopf", "Zu weit abgespreizte Ellbogen"],
    safety: ["Leichtere Variante mit höherer Handposition wählen."]
  },
  {
    id: "sit-up",
    name: "Sit-ups",
    equipment: "Klimmzugstation",
    setup: ["Füße sicher fixieren, Knie beugen.", "Bauch anspannen und Nacken neutral halten."],
    movement: ["Oberkörper mit der Bauchmuskulatur anheben.", "Nur so weit aufrichten, wie der Rücken kontrolliert bleibt.", "Wirbel für Wirbel absenken."],
    breathing: "Beim Aufrichten ausatmen, beim Absenken einatmen.",
    tempo: "Ruhig und ohne Schwung.",
    mistakes: ["Am Nacken ziehen", "Mit Schwung starten", "Hohlkreuz beim Absenken"],
    safety: ["Bei Rücken- oder Nackenschmerz abbrechen; Crunch-Variante bevorzugen."]
  },
  {
    id: "leg-raise",
    name: "Hängendes Beinheben",
    equipment: "Klimmzugstation",
    setup: ["Sicher greifen oder Unterarme stabil auflegen.", "Schultern aktiv nach unten ziehen und Rumpf anspannen."],
    movement: ["Knie kontrolliert Richtung Brust führen.", "Becken leicht einrollen.", "Beine langsam ohne Pendeln absenken."],
    breathing: "Beim Anheben ausatmen, beim Absenken einatmen.",
    tempo: "2 Sekunden anheben, 3 Sekunden absenken.",
    mistakes: ["Pendeln", "Schultern hochziehen", "Beine fallen lassen"],
    safety: ["Zuerst mit gebeugten Knien arbeiten.", "Griff rechtzeitig lösen, bevor er versagt."]
  },
  {
    id: "butterfly",
    name: "Butterfly",
    equipment: "Kraftstation",
    setup: ["Sitz so einstellen, dass Griffe auf Brusthöhe liegen.", "Rücken und Kopf anlehnen, Füße stabil aufstellen."],
    movement: ["Arme in einem kontrollierten Bogen zusammenführen.", "Brust kurz anspannen, Schultern unten lassen.", "Langsam bis zur angenehmen Dehnung öffnen."],
    breathing: "Beim Schließen ausatmen, beim Öffnen einatmen.",
    tempo: "2 Sekunden schließen, 3 Sekunden öffnen.",
    mistakes: ["Zu hohes Gewicht", "Schultern nach vorne ziehen", "Gewichtsstapel aufschlagen lassen"],
    safety: ["Keine aggressive Dehnung hinter die Körperlinie.", "Gewicht für Kinder besonders leicht wählen."]
  },
  {
    id: "lat-pulldown",
    name: "Latzug",
    equipment: "Kraftstation",
    setup: ["Oberschenkelpolster sicher einstellen.", "Stange etwas weiter als schulterbreit greifen, Brustbein anheben."],
    movement: ["Stange vor dem Körper Richtung oberer Brust ziehen.", "Ellbogen nach unten führen, nicht nach hinten reißen.", "Arme kontrolliert strecken."],
    breathing: "Beim Herunterziehen ausatmen, beim Hochführen einatmen.",
    tempo: "2 Sekunden ziehen, 3 Sekunden zurückführen.",
    mistakes: ["Stange hinter den Nacken ziehen", "Stark nach hinten lehnen", "Schwung aus dem Oberkörper"],
    safety: ["Nie hinter den Kopf ziehen.", "Gewichte nur bei stillstehendem Stapel umstecken."]
  },
  {
    id: "treadmill",
    name: "Laufband",
    equipment: "Laufband",
    setup: ["Schnürsenkel prüfen und Sicherheitsclip befestigen.", "Seitlich aufsteigen und Band langsam starten."],
    movement: ["Aufrecht und mittig laufen, Blick nach vorne.", "Kurze natürliche Schritte verwenden.", "Geschwindigkeit langsam verändern."],
    breathing: "Gleichmäßig atmen; bei moderatem Tempo sollte Sprechen möglich bleiben.",
    tempo: "Mit 5–10 Minuten lockerem Aufwärmen beginnen und langsam auslaufen.",
    mistakes: ["Dauerhaft am Griff festhalten", "Zu weit hinten laufen", "Abrupte Geschwindigkeitswechsel"],
    safety: ["Kinder nur unter Aufsicht.", "Bei Schwindel Not-Stopp verwenden und sicher absteigen."]
  },
  {
    id: "vibration",
    name: "Vibrationsplatte",
    equipment: "Vibrationsplatte",
    setup: ["Stabil und mittig stehen, Knie leicht beugen.", "Mit niedriger Stufe und kurzer Dauer beginnen."],
    movement: ["Gelenke weich halten und Position kontrollieren.", "Bei Übungen langsam und ohne Zusatzschwung arbeiten."],
    breathing: "Ruhig weiteratmen, nicht pressen.",
    tempo: "Kurze Intervalle nach Herstellerangabe.",
    mistakes: ["Durchgedrückte Knie", "Zu hohe Intensität", "Lange ungewohnte Belastung"],
    safety: ["Herstellerhinweise und medizinische Gegenanzeigen beachten.", "Bei Unwohlsein sofort ausschalten."]
  },
  {
    id: "punchbag",
    name: "Boxsack",
    equipment: "Boxsack",
    setup: ["Bandagen und passende Handschuhe verwenden.", "Stabiler Stand, Hände am Kopf, Handgelenke gerade."],
    movement: ["Schläge aus Körperdrehung und Beinarbeit führen.", "Arm nicht vollständig durchschlagen.", "Hand nach jedem Schlag zur Deckung zurückbringen."],
    breathing: "Bei jedem Schlag kurz ausatmen.",
    tempo: "Technik vor Härte; kurze Runden mit Pausen.",
    mistakes: ["Abgeknickte Handgelenke", "Maximalkraft ohne Aufwärmen", "Deckung fallen lassen"],
    safety: ["Sackaufhängung regelmäßig prüfen.", "Kinder trainieren Technik und Kontrolle, nicht maximale Schlaghärte."]
  },
  {
    id: "bike",
    name: "Fahrrad",
    equipment: "Fahrrad",
    setup: ["Sattelhöhe so wählen, dass das Knie unten leicht gebeugt bleibt.", "Füße sicher auf Pedalen platzieren."],
    movement: ["Rund und gleichmäßig treten.", "Oberkörper ruhig und Schultern locker halten.", "Widerstand schrittweise verändern."],
    breathing: "Gleichmäßig atmen; bei moderatem Tempo sollte Sprechen möglich sein.",
    tempo: "5–10 Minuten aufwärmen, danach Hauptteil und ruhiges Ausfahren.",
    mistakes: ["Zu niedriger Sattel", "Zu hoher Widerstand bei niedriger Trittfrequenz", "Verkrampfte Schultern"],
    safety: ["Bei Knieschmerz Einstellung und Widerstand prüfen."]
  },
  {
    id: "squat",
    name: "Kniebeugen",
    equipment: "Kraftstation",
    setup: ["Füße schulterbreit aufstellen, Fußspitzen leicht nach außen gedreht.", "Bauch und Rücken fest anspannen, Brust aufrichten."],
    movement: ["Hüfte nach hinten-unten führen, als würde man sich auf einen Stuhl setzen.", "Knie in Richtung der Fußspitzen bewegen, Fersen am Boden halten.", "Über die Fersen kraftvoll wieder nach oben drücken."],
    breathing: "Beim Absenken einatmen, beim Hochdrücken ausatmen.",
    tempo: "3 Sekunden absenken, 1 Sekunde halten, 2 Sekunden aufrichten.",
    mistakes: ["Knie fallen nach innen", "Fersen heben vom Boden ab", "Rundrücken"],
    safety: ["Erst mit Eigengewicht die Tiefe kontrollieren, bevor Zusatzgewicht genutzt wird."]
  },
  {
    id: "deadlift",
    name: "Kreuzheben",
    equipment: "Kraftstation",
    setup: ["Hüftbreiter Stand, Schienbeine nah an der Hantelstange oder Kettlebell.", "Gerader Rücken, Brust herausstrecken, Schultern zurück."],
    movement: ["Aus den Beinen und der Hüfte heben, Rücken bleibt vollkommen gerade.", "Stange eng am Körper nach oben führen.", "Oben Gesäß kurz anspannen, nicht nach hinten überstrecken."],
    breathing: "Vor dem Heben einatmen und Rumpf versteifen, oben ausatmen.",
    tempo: "2 Sekunden zügig heben, 3 Sekunden kontrolliert absenken.",
    mistakes: ["Katzenbuckel oder Hohlkreuz", "Gewicht zu weit weg vom Körper", "Hektisches Anreißen"],
    safety: ["Rückenspannung hat oberste Priorität; bei Ermüdung Satz beenden."]
  },
  {
    id: "bench-press",
    name: "Bankdrücken",
    equipment: "Kraftstation",
    setup: ["Stabil auf die Bank legen, Augen unter der Stange, Füße flach auf den Boden.", "Schulterblätter zusammenziehen, Stange etwas mehr als schulterbreit greifen."],
    movement: ["Stange kontrolliert zur unteren Brust absenken.", "Ellbogen in etwa 45–70 Grad zum Körper halten.", "Kraftvoll nach oben drücken, ohne die Ellbogen zu überstrecken."],
    breathing: "Beim Absenken einatmen, beim Drücken ausatmen.",
    tempo: "2–3 Sekunden absenken, 1 Sekunde drücken.",
    mistakes: ["Ellbogen 90 Grad abspreizen (Schulterbelastung)", "Gewicht auf der Brust abprallen lassen", "Gesäß von der Bank heben"],
    safety: ["Immer Sicherheitsablagen oder Trainingspartner nutzen."]
  },
  {
    id: "shoulder-press",
    name: "Schulterdrücken",
    equipment: "Kraftstation",
    setup: ["Aufrecht sitzen oder stabiler Stand, Rumpf fest angespannt.", "Griffe oder Hanteln auf Höhe der oberen Brust/Schulter halten."],
    movement: ["Gewicht kontrolliert senkrecht über den Kopf drücken.", "Ellbogen oben nicht vollständig durchdrücken.", "Langsam wieder bis auf Schulterhöhe absenken."],
    breathing: "Beim Drücken ausatmen, beim Absenken einatmen.",
    tempo: "2 Sekunden drücken, 3 Sekunden absenken.",
    mistakes: ["Starkes Hohlkreuz", "Kopf nach vorne schieben", "Schwunghaftes Wippen"],
    safety: ["Rückenlehne nutzen, um den unteren Rücken zu stabilisieren."]
  },
  {
    id: "rowing",
    name: "Rudern",
    equipment: "Kraftstation",
    setup: ["Aufrecht sitzen, Brust an das Polster bzw. Füße stabil abstützen.", "Griffe greifen, Schultern nach hinten-unten setzen."],
    movement: ["Ellbogen eng am Körper nach hinten ziehen.", "Schulterblätter am Ende der Bewegung fest zusammenziehen.", "Arme kontrolliert wieder nach vorne führen."],
    breathing: "Beim Ziehen ausatmen, beim Vorlassen einatmen.",
    tempo: "2 Sekunden ziehen, 1 Sekunde halten, 3 Sekunden zurück.",
    mistakes: ["Mit Schwung nach hinten kippen", "Schultern hoch zu den Ohren ziehen", "Runder oberer Rücken"],
    safety: ["Saubere Haltung geht immer vor Gewicht."]
  },
  {
    id: "plank",
    name: "Unterarmstütz",
    equipment: "Klimmzugstation",
    setup: ["Unterarme parallel auf den Boden auflegen, Ellbogen unter den Schultern.", "Beine ausstrecken, Zehenspitzen aufstellen."],
    movement: ["Körper wie ein Brett anspannen (Bauch, Gesäß, Beine).", "Blick nach unten zum Boden richten, Nacken lang.", "Position ruhig und gleichmäßig halten."],
    breathing: "Gleichmäßig und ruhig weiteratmen, nicht die Luft anhalten.",
    tempo: "Statisch halten (z.B. 30–60 Sekunden).",
    mistakes: ["Durchhängende Hüfte (Hohlkreuz)", "Gesäß zu weit in die Höhe gestreckt", "Kopf in den Nacken gelegt"],
    safety: ["Sobald die Hüfte durchhängt, kurz auf die Knie absetzen."]
  },
  {
    id: "lunge",
    name: "Ausfallschritte",
    equipment: "Kraftstation",
    setup: ["Aufrechter Stand, Füße hüftbreit, Hände in die Hüfte oder an Hanteln."],
    movement: ["Großen Schritt nach vorne machen.", "Hinteres Knie kontrolliert Richtung Boden absenken (ca. 90-Grad-Winkel in beiden Knien).", "Über die vordere Ferse kraftvoll zurück in den Stand stoßen."],
    breathing: "Beim Absenken einatmen, beim Zurückstoßen ausatmen.",
    tempo: "2 Sekunden absenken, 1 Sekunde heben.",
    mistakes: ["Vorderes Knie ragt weit über die Zehenspitzen", "Oberkörper kippt nach vorne", "Wackeliges Knie nach innen"],
    safety: ["Stabiles Schuhwerk und rutschfeste Unterlage nutzen."]
  },
  {
    id: "jump-rope",
    name: "Seilspringen",
    equipment: "Laufband",
    setup: ["Seillänge anpassen: Wenn man mit einem Fuß draufsteht, reichen die Griffe bis zur Brust.", "Lockerer aufrechter Stand, Ellbogen nah am Körper."],
    movement: ["Aus den Handgelenken schwungvoll drehen.", "Nur wenige Zentimeter hoch auf den Fußballen federn.", "Knie leicht gebeugt halten zur Stoßdämpfung."],
    breathing: "Gleichmäßig durch die Nase ein- und Mund ausatmen.",
    tempo: "Rhythmisch und gleichmäßig springen.",
    mistakes: ["Aus der ganzen Schulter drehen", "Zu hoch springen", "Mit den Fersen aufschlagen"],
    safety: ["Gedämpfte Schuhe tragen; bei Gelenkbeschwerden sanfter federn."]
  },
  {
    id: "burpee",
    name: "Burpees",
    equipment: "Klimmzugstation",
    setup: ["Hüftbreiter Stand, Rumpf vorbereitet."],
    movement: ["In die Kniebeuge gehen, Hände vor den Füßen aufsetzen.", "Mit den Füßen nach hinten in den Stütz springen (optional Liegestütz).", "Füße wieder nach vorne ziehen und mit einem Strecksprung aufrichten."],
    breathing: "Unten einatmen, beim Strecksprung kraftvoll ausatmen.",
    tempo: "Flüssige, kontrollierte Bewegung, Qualität vor Schnelligkeit.",
    mistakes: ["Hohlkreuz im Stütz", "Unkontrolliertes Aufprallen", "Mangelnde Körperspannung"],
    safety: ["Einsteiger steigen schrittweise nach hinten, statt zu springen."]
  },
  {
    id: "dip",
    name: "Dips",
    equipment: "Klimmzugstation",
    setup: ["An den Holmen im Stütz halten, Arme fast gestreckt, Schultern unten."],
    movement: ["Ellbogen beugen und Körper kontrolliert absenken (bis ca. 90 Grad im Ellbogen).", "Oberkörper leicht nach vorne neigen für mehr Brustbeteiligung.", "Kraftvoll zurück nach oben in den Stütz drücken."],
    breathing: "Beim Absenken einatmen, beim Hochdrücken ausatmen.",
    tempo: "2–3 Sekunden absenken, 1 Sekunde hochdrücken.",
    mistakes: ["Schultern zu den Ohren wandern lassen", "Zu tief absenken (Schulterzerrung)", "Ellbogen nach außen wegknicken"],
    safety: ["Nur so weit absenken, wie es in der vorderen Schulter schmerzfrei bleibt."]
  }
];

export function resolveExerciseId(name: string): string {
  if (!name || typeof name !== "string") return "push-up";
  const lower = name.toLowerCase().trim();

  // Exakte IDs
  const match = EXERCISE_GUIDES.find((g) => g.id === lower);
  if (match) return match.id;

  // Spezifische Alias- und Schlagwort-Zuordnungen
  if (lower.includes("squat") || lower.includes("kniebeuge")) return "squat";
  if (lower.includes("pull-up") || lower.includes("pull up") || lower.includes("pullup") || lower.includes("chin-up") || lower.includes("klimmzug") || lower.includes("klimmzüge")) return "pull-up";
  if (lower.includes("push-up") || lower.includes("push up") || lower.includes("pushup") || lower.includes("liegestütz") || lower.includes("liegestütze")) return "push-up";
  if (lower.includes("row") || lower.includes("rudern") || lower.includes("seated row")) return "rowing";
  if (lower.includes("deadlift") || lower.includes("kreuzheben")) return "deadlift";
  if (lower.includes("bench press") || lower.includes("bankdrücken") || lower.includes("bench-press") || lower.includes("chest press")) return "bench-press";
  if (lower.includes("shoulder") || lower.includes("schulter") || lower.includes("overhead press") || lower.includes("lateral raise") || lower.includes("seitheben")) return "shoulder-press";
  if (lower.includes("plank") || lower.includes("unterarmstütz") || lower.includes("side plank")) return "plank";
  if (lower.includes("lunge") || lower.includes("ausfallschritt")) return "lunge";
  if (lower.includes("jump rope") || lower.includes("skipping") || lower.includes("seilspringen") || lower.includes("seil springen")) return "jump-rope";
  if (lower.includes("burpee") || lower.includes("liegestützsprung")) return "burpee";
  if (lower.includes("dip") || lower.includes("barrenstütz")) return "dip";
  if (lower.includes("crunch") || lower.includes("sit-up") || lower.includes("sit up") || lower.includes("twist") || lower.includes("abs") || lower.includes("bauch")) return "sit-up";
  if (lower.includes("leg raise") || lower.includes("beinheben")) return "leg-raise";
  if (lower.includes("butterfly") || lower.includes("fly")) return "butterfly";
  if (lower.includes("lat") || lower.includes("latzug")) return "lat-pulldown";
  if (lower.includes("laufband") || lower.includes("treadmill") || lower.includes("run") || lower.includes("lauf") || lower.includes("jog") || lower.includes("sprint") || lower.includes("walk")) return "treadmill";
  if (lower.includes("vibrat") || lower.includes("platte")) return "vibration";
  if (lower.includes("box") || lower.includes("punch") || lower.includes("sack")) return "punchbag";
  if (lower.includes("bike") || lower.includes("rad") || lower.includes("fahrrad") || lower.includes("ergometer") || lower.includes("cycl")) return "bike";

  // Name matches
  const nameMatch = EXERCISE_GUIDES.find((g) => lower.includes(g.name.toLowerCase()));
  if (nameMatch) return nameMatch.id;

  return "push-up";
}

export function getExerciseGuide(id: string): ExerciseGuide {
  const exact = EXERCISE_GUIDES.find((guide) => guide.id === id);
  if (exact) return exact;

  const resolved = resolveExerciseId(id);
  const resolvedGuide = EXERCISE_GUIDES.find((guide) => guide.id === resolved);
  if (resolvedGuide) return resolvedGuide;

  return EXERCISE_GUIDES[0];
}

export function getExerciseGuideFromRecord(record: {
  id: string;
  name: string;
  equipment: string;
  instructions: string | null;
  safetyNotes: string | null;
}): ExerciseGuide {
  const base = EXERCISE_GUIDES.find((guide) => guide.id === record.id);
  const instructions = record.instructions?.split(/\r?\n/).map((step) => step.trim()).filter(Boolean) ?? [];
  const safety = record.safetyNotes?.split(/\r?\n/).map((step) => step.trim()).filter(Boolean) ?? [];
  return {
    id: record.id,
    name: record.name,
    equipment: record.equipment,
    setup: base?.setup ?? [],
    movement: instructions.length ? instructions : (base?.movement ?? ["Für diese Übung ist noch keine Anleitung hinterlegt."]),
    breathing: base?.breathing ?? "Ruhig und gleichmäßig atmen, ohne die Luft anzuhalten.",
    tempo: base?.tempo ?? "Langsam und kontrolliert bewegen.",
    mistakes: base?.mistakes ?? [],
    safety: safety.length ? safety : (base?.safety ?? ["Nur schmerzfrei und mit kontrollierter Bewegung trainieren."])
  };
}
