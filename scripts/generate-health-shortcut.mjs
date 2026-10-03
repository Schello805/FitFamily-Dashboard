#!/usr/bin/env node
// Build a template, never embed a real sync credential. Only built-in actions.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

export const SECRET_PLACEHOLDER = "HIER_DEN_SYNC_SCHLUESSEL_EINFUEGEN";
// Verified against Cherri's compiler/file-format: 1=dict, 3=number (not reversed).
export const ITEM_TYPES = { text: 0, dictionary: 1, array: 2, number: 3, boolean: 4 };
export const METRICS = [
  { key: "moveCalories", label: "Active Calories", factors: { kcal: [1, 1], Cal: [1, 1], kJ: [1000, 4184], J: [1, 4184] } },
  { key: "exerciseMinutes", label: "Exercise Minutes", factors: { min: [1, 1], "min.": [1, 1], minutes: [1, 1], Minuten: [1, 1], sec: [1, 60], s: [1, 60], hr: [60, 1], h: [60, 1] } },
  { key: "stepCount", label: "Steps", factors: { count: [1, 1], steps: [1, 1], Schritte: [1, 1], "": [1, 1] } },
  { key: "walkingRunningDistanceKm", label: "Walking + Running Distance", factors: { km: [1, 1], m: [1, 1000], mi: [1609344, 1000000], ft: [3048, 10000000] } },
  { key: "cyclingDistanceKm", label: "Cycling Distance", factors: { km: [1, 1], m: [1, 1000], mi: [1609344, 1000000], ft: [3048, 10000000] } }
];

const state = (type, value) => ({ Value: value, WFSerializationType: type });
const text = (value) => state("WFTextTokenString", { string: String(value) });
const ref = (id, name) => ({ Type: "ActionOutput", OutputUUID: id, OutputName: name });
const variable = (name) => ({ Type: "Variable", VariableName: name });
const input = (value) => state("WFTextTokenAttachment", value);
const tokenText = (value) => state("WFTextTokenString", { string: "\uFFFC", attachmentsByRange: { "{0, 1}": value } });
const item = (key, type, value) => ({ WFKey: text(key), WFItemType: type, WFValue: value });
const dictionary = (items) => state("WFDictionaryFieldValue", { WFDictionaryFieldValueItems: items });

export function buildHealthShortcut({ profileId = "papa", server = "http://192.168.1.253:3000" } = {}) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(profileId)) throw new Error("Ungültige Profil-ID.");
  const url = new URL(server);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Bitte nur die Server-Basisadresse ohne Zugangsdaten oder Pfad angeben.");
  const actions = [];
  function action(id, params = {}) {
    const UUID = randomUUID().toUpperCase();
    actions.push({ WFWorkflowActionIdentifier: `is.workflow.actions.${id}`, WFWorkflowActionParameters: { UUID, ...params } });
    return UUID;
  }
  action("comment", { WFCommentActionText: "FitFamily Health Sync – iPhone-Testvorlage. Ersetze den Schlüssel im folgenden Text. Nur HEUTE, keine Health-Schreibaktionen. Leere Abfragen können auch fehlende Leserechte bedeuten. Rohdaten verschiedener Quellen können von Apple Fitness abweichen: vor Automatisierung im Importprotokoll vergleichen. Stehminuten werden NICHT in erfüllte Stehstunden umgerechnet." });
  const secret = action("gettext", { WFTextActionText: SECRET_PLACEHOLDER });
  const now = action("date", { WFDateActionMode: "Current Date" });
  const date = action("format.date", { WFDate: tokenText(ref(now, "Date")), WFInput: input(ref(now, "Date")), WFDateFormatStyle: "Custom", WFDateFormat: "Custom", WFDateFormatString: "yyyy-MM-dd", WFTimeFormatStyle: "None" });

  for (const metric of METRICS) {
    action("comment", { WFCommentActionText: `${metric.key}: heutige Messungen einzeln lesen, Einheit prüfen und nur Zahlen summieren. Ohne Treffer bleibt der Tageswert 0; Leserechte im iPhone prüfen.` });
    const zero = action("number", { WFNumberActionNumber: "0" });
    action("setvariable", { WFVariableName: metric.key, WFInput: input(ref(zero, "Number")) });
    // Integer ratios avoid locale-dependent parsing of decimal-point literals.
    const factors = action("dictionary", { WFItems: dictionary(Object.entries(metric.factors).map(([unit, ratio]) => item(unit, ITEM_TYPES.number, text(ratio[0])))) });
    const divisors = action("dictionary", { WFItems: dictionary(Object.entries(metric.factors).map(([unit, ratio]) => item(unit, ITEM_TYPES.number, text(ratio[1])))) });
    const samples = action("filter.health.quantity", {
      WFContentItemLimitEnabled: false,
      WFContentItemFilter: state("WFContentPredicateTableTemplate", {
        WFActionParameterFilterPrefix: 1,
        WFContentPredicateBoundedDate: false,
        WFActionParameterFilterTemplates: [
          { Bounded: true, Removable: false, Property: "Type", Operator: 4, Values: { Enumeration: state("WFStringSubstitutableState", metric.label) } },
          { Bounded: true, Removable: false, Property: "Start Date", Operator: 1002, Values: { Number: "7", Unit: 16 } }
        ]
      })
    });
    const loop = randomUUID().toUpperCase();
    action("repeat.each", { GroupingIdentifier: loop, WFControlFlowMode: 0, WFInput: input(ref(samples, "Health Samples")) });
    const value = action("properties.health.quantity", { WFContentItemPropertyName: "Value", WFInput: input(variable("Repeat Item")) });
    const unit = action("properties.health.quantity", { WFContentItemPropertyName: "Unit", WFInput: input(variable("Repeat Item")) });
    const factor = action("getvalueforkey", { WFGetDictionaryValueType: "Value", WFDictionaryKey: tokenText(ref(unit, "Unit")), WFInput: input(ref(factors, "Dictionary")) });
    const guard = randomUUID().toUpperCase();
    // If uses a variable-parameter wrapper, unlike ordinary action inputs.
    // A bare token attachment imports as an empty "Condition" on iPhone.
    action("conditional", { GroupingIdentifier: guard, WFControlFlowMode: 0, WFCondition: 101, WFInput: { Type: "Variable", Variable: input(ref(factor, "Dictionary Value")) } });
    action("showresult", { Text: text(`Unbekannte Einheit für ${metric.key}. Übertragung abgebrochen. Bitte die Einheit im Kurzbefehl prüfen.`) });
    action("exit");
    action("conditional", { GroupingIdentifier: guard, WFControlFlowMode: 2 });
    const divisor = action("getvalueforkey", { WFGetDictionaryValueType: "Value", WFDictionaryKey: tokenText(ref(unit, "Unit")), WFInput: input(ref(divisors, "Dictionary")) });
    const multiplied = action("math", { WFInput: input(ref(value, "Value")), WFMathOperation: "×", WFMathOperand: tokenText(ref(factor, "Dictionary Value")) });
    const normalized = action("math", { WFInput: input(ref(multiplied, "Calculation Result")), WFMathOperation: "÷", WFMathOperand: tokenText(ref(divisor, "Dictionary Value")) });
    const sum = action("math", { WFInput: input(variable(metric.key)), WFMathOperand: tokenText(ref(normalized, "Calculation Result")) });
    action("setvariable", { WFVariableName: metric.key, WFInput: input(ref(sum, "Calculation Result")) });
    action("repeat.each", { GroupingIdentifier: loop, WFControlFlowMode: 2 });
  }
  const rounded = action("round", { WFInput: input(variable("stepCount")), WFRoundType: "Right of Decimal", WFRoundDecimalPlaces: 0, WFRoundMode: "Normal" });
  action("setvariable", { WFVariableName: "stepCount", WFInput: input(ref(rounded, "Rounded Number")) });
  const day = dictionary([
    item("date", ITEM_TYPES.text, tokenText(ref(date, "Formatted Date"))),
    ...METRICS.map(({ key }) => item(key, ITEM_TYPES.number, tokenText(variable(key))))
  ]);
  const sent = action("downloadurl", {
    WFURL: text(`${url.origin}/api/sync/apple-health`), WFHTTPMethod: "POST", WFHTTPBodyType: "JSON",
    WFJSONValues: dictionary([
      item("profileId", ITEM_TYPES.text, text(profileId)),
      item("secret", ITEM_TYPES.text, tokenText(ref(secret, "Text"))),
      // The server explicitly accepts a single day dictionary as well as an array.
      // Nested dictionary values require an extra dictionary state wrapper.
      item("dailyActivity", ITEM_TYPES.dictionary, state("WFDictionaryFieldValue", day))
    ])
  });
  action("showresult", { Text: tokenText(ref(sent, "Contents of URL")) });
  return {
    WFWorkflowName: "FitFamily Health Sync", WFWorkflowActions: actions,
    WFWorkflowClientVersion: "2600.0.0", WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: "900", WFWorkflowHasOutputFallback: false,
    WFWorkflowIcon: { WFWorkflowIconStartColor: 4282601983, WFWorkflowIconGlyphNumber: 59511 },
    WFWorkflowInputContentItemClasses: [], WFWorkflowOutputContentItemClasses: [],
    WFWorkflowTypes: [], WFWorkflowImportQuestions: []
  };
}

const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export function plist(value) {
  if (typeof value === "boolean") return value ? "<true/>" : "<false/>";
  if (typeof value === "number") return `<${Number.isInteger(value) ? "integer" : "real"}>${value}</${Number.isInteger(value) ? "integer" : "real"}>`;
  if (typeof value === "string") return `<string>${escapeXml(value)}</string>`;
  if (Array.isArray(value)) return `<array>${value.map(plist).join("\n")}</array>`;
  return `<dict>${Object.entries(value).map(([key, item]) => `<key>${escapeXml(key)}</key>${plist(item)}`).join("\n")}</dict>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const allowed = new Set(["--profile", "--server", "--output", "--sign", "--sign-mode"]);
  const options = {};
  for (let index = 0; index < args.length; index++) {
    if (!allowed.has(args[index])) throw new Error(`Unbekannte Option: ${args[index]}`);
    const key = args[index];
    if (key === "--sign") options.sign = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`Wert für ${key} fehlt.`);
      options[key.slice(2)] = value;
    }
  }
  const signMode = options["sign-mode"] ?? "anyone";
  if (!["anyone", "people-who-know-me"].includes(signMode)) throw new Error("Signierungsmodus muss anyone oder people-who-know-me sein.");
  const output = resolve(options.output ?? "artifacts/FitFamily-Health-Sync-v4.unsigned.shortcut");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${plist(buildHealthShortcut({ profileId: options.profile, server: options.server }))}</plist>\n`);
  console.log(`Vorlage erzeugt: ${output}`);
  if (options.sign) {
    if (process.platform !== "darwin") throw new Error("Signierung benötigt macOS. Die unsignierte Vorlage bleibt erhalten.");
    const signed = output.replace(/(?:\.unsigned)?\.shortcut$/, "") + ".signed.shortcut";
    if (signMode === "people-who-know-me") console.log("Hinweis: Apple fügt deine Kontaktinformationen zur Datei hinzu. Nur für Personen, die dich in ihren Kontakten haben.");
    // Isolate Apple's signing process: preserve the unsigned source and don't
    // leave a partial/stale output labelled as a successfully signed shortcut.
    const staging = mkdtempSync(resolve(tmpdir(), "fitfamily-sign-"));
    try {
      const source = resolve(staging, "input.shortcut");
      const target = resolve(staging, "signed.shortcut");
      writeFileSync(source, readFileSync(output));
      const converted = spawnSync("/usr/bin/plutil", ["-convert", "binary1", source], { stdio: "inherit" });
      if (converted.status !== 0) throw new Error("Plist-Konvertierung fehlgeschlagen.");
      const result = spawnSync("/usr/bin/shortcuts", ["sign", "--mode", signMode, "--input", source, "--output", target], { stdio: "inherit", timeout: 60000 });
      if (result.status !== 0 || !existsSync(target)) throw new Error("Apple-Signierung fehlgeschlagen. Vorlage erhalten; keine neue signierte Datei erstellt. Bei Fehler 502 kann --sign-mode people-who-know-me für die persönliche Übertragung verwendet werden (enthält Kontaktinformationen).");
      renameSync(target, signed);
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
    console.log(`Signierte iPhone-Testdatei: ${signed}`);
  }
}
