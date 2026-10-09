import { randomUUID } from "node:crypto";

type Plist = string | number | boolean | Plist[] | { [key: string]: Plist };
const state = (type: string, value: Plist): Plist => ({ Value: value, WFSerializationType: type });
const text = (value: string) => state("WFTextTokenString", { string: value });
const ref = (id: string, name: string): Plist => ({ Type: "ActionOutput", OutputUUID: id, OutputName: name });
const input = (value: Plist) => state("WFTextTokenAttachment", value);
function tokens(parts: (string | Plist)[]) {
  let string = "";
  const attachmentsByRange: Record<string, Plist> = {};
  for (const part of parts) {
    if (typeof part === "string") string += part;
    else { attachmentsByRange[`{${string.length}, 1}`] = part; string += "\uFFFC"; }
  }
  return state("WFTextTokenString", { string, attachmentsByRange });
}
const dictionary = (items: [string, Plist][]) => state("WFDictionaryFieldValue", {
  WFDictionaryFieldValueItems: items.map(([key, value]) => ({ WFKey: text(key), WFItemType: 0, WFValue: value }))
});
export function buildEnergyShortcut(profileId: string, server: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(profileId)) throw new Error("Ungültige Profil-ID.");
  const url = new URL(server);
  if (["0.0.0.0", "localhost", "[::]", "[::1]"].includes(url.hostname.toLowerCase()) || /^127\./.test(url.hostname)) throw new Error("Serveradresse ist vom iPhone nicht erreichbar.");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Ungültige Serveradresse.");
  const actions: Plist[] = [];
  const action = (id: string, params: Record<string, Plist> = {}) => {
    const UUID = randomUUID().toUpperCase();
    actions.push({ WFWorkflowActionIdentifier: `is.workflow.actions.${id}`, WFWorkflowActionParameters: { UUID, ...params } });
    return UUID;
  };
  action("comment", { WFCommentActionText: "FitFamily Alltag v3: Energie und Schritte der letzten 30 Tage, ohne Wertung. Schlüssel und exakten Health-Datenquellennamen in den nächsten beiden Textaktionen einfügen. Jeder Messwert enthält seinen Kalendertag; FitFamily gruppiert und ersetzt jeden Tag einzeln. Nur die ausgewählte Quelle wird summiert. Zunächst auf dem iPhone manuell testen. Nicht mit eingefügtem Schlüssel teilen." });
  const secret = action("gettext", { WFTextActionText: "FAMILIENSCHLUESSEL_HIER_EINFUEGEN" });
  const source = action("gettext", { WFTextActionText: "EXAKTEN_HEALTH_DATENQUELLENNAMEN_EINFUEGEN" });
  const samples = action("filter.health.quantity", {
    WFContentItemLimitEnabled: false,
    WFContentItemFilter: state("WFContentPredicateTableTemplate", {
      WFActionParameterFilterPrefix: 1, WFContentPredicateBoundedDate: false,
      WFActionParameterFilterTemplates: [
        { Bounded: true, Removable: false, Property: "Type", Operator: 4, Values: { Enumeration: state("WFStringSubstitutableState", "Active Calories") } },
        { Bounded: true, Removable: false, Property: "Start Date", Operator: 1002, Values: { Number: "30", Unit: 16 } }
      ]
    })
  });
  // Explicit named lists avoid an unresolved Repeat Results magic variable
  // becoming the pale, empty “Text List” placeholder in imported shortcuts.
  const emptyEnergy = action("nothing");
  action("setvariable", { WFVariableName: "Energiezeilen", WFInput: input(ref(emptyEnergy, "Nothing")) });
  const loop = randomUUID().toUpperCase();
  action("repeat.each", { GroupingIdentifier: loop, WFControlFlowMode: 0, WFInput: input(ref(samples, "Health Samples")) });
  const repeatItem: Plist = { Type: "Variable", VariableName: "Repeat Item" };
  const value = action("properties.health.quantity", { WFContentItemPropertyName: "Value", WFInput: input(repeatItem) });
  const unit = action("properties.health.quantity", { WFContentItemPropertyName: "Unit", WFInput: input(repeatItem) });
  const origin = action("properties.health.quantity", { WFContentItemPropertyName: "Source", WFInput: input(repeatItem) });
  const energyStartedAt = action("properties.health.quantity", { WFContentItemPropertyName: "Start Date", WFInput: input(repeatItem) });
  const energyDay = action("format.date", { WFDate: tokens([ref(energyStartedAt, "Start Date")]), WFInput: input(ref(energyStartedAt, "Start Date")), WFDateFormatStyle: "Custom", WFDateFormat: "yyyy-MM-dd", WFTimeFormatStyle: "None" });
  const energyLine = action("gettext", { WFTextActionText: tokens([ref(energyDay, "Formatted Date"), "\t", ref(value, "Value"), "\t", ref(unit, "Unit"), "\t", ref(origin, "Source")]) });
  action("appendvariable", { WFVariableName: "Energiezeilen", WFInput: input(ref(energyLine, "Text")) });
  action("repeat.each", { GroupingIdentifier: loop, WFControlFlowMode: 2 });
  // Unlike most actions, Combine Text reads its input from lowercase `text`.
  const rows = action("text.combine", { text: input({ Type: "Variable", VariableName: "Energiezeilen" }), WFTextSeparator: "New Lines" });
  const stepSamples = action("filter.health.quantity", {
    WFContentItemLimitEnabled: false,
    WFContentItemFilter: state("WFContentPredicateTableTemplate", {
      WFActionParameterFilterPrefix: 1, WFContentPredicateBoundedDate: false,
      WFActionParameterFilterTemplates: [
        { Bounded: true, Removable: false, Property: "Type", Operator: 4, Values: { Enumeration: state("WFStringSubstitutableState", "Steps") } },
        { Bounded: true, Removable: false, Property: "Start Date", Operator: 1002, Values: { Number: "30", Unit: 16 } }
      ]
    })
  });
  const emptySteps = action("nothing");
  action("setvariable", { WFVariableName: "Schrittzeilen", WFInput: input(ref(emptySteps, "Nothing")) });
  const stepLoop = randomUUID().toUpperCase();
  action("repeat.each", { GroupingIdentifier: stepLoop, WFControlFlowMode: 0, WFInput: input(ref(stepSamples, "Health Samples")) });
  const stepValue = action("properties.health.quantity", { WFContentItemPropertyName: "Value", WFInput: input(repeatItem) });
  const stepUnit = action("properties.health.quantity", { WFContentItemPropertyName: "Unit", WFInput: input(repeatItem) });
  const stepSource = action("properties.health.quantity", { WFContentItemPropertyName: "Source", WFInput: input(repeatItem) });
  const stepStartedAt = action("properties.health.quantity", { WFContentItemPropertyName: "Start Date", WFInput: input(repeatItem) });
  const stepDay = action("format.date", { WFDate: tokens([ref(stepStartedAt, "Start Date")]), WFInput: input(ref(stepStartedAt, "Start Date")), WFDateFormatStyle: "Custom", WFDateFormat: "yyyy-MM-dd", WFTimeFormatStyle: "None" });
  const stepLine = action("gettext", { WFTextActionText: tokens([ref(stepDay, "Formatted Date"), "\t", ref(stepValue, "Value"), "\t", ref(stepUnit, "Unit"), "\t", ref(stepSource, "Source")]) });
  action("appendvariable", { WFVariableName: "Schrittzeilen", WFInput: input(ref(stepLine, "Text")) });
  action("repeat.each", { GroupingIdentifier: stepLoop, WFControlFlowMode: 2 });
  const stepRows = action("text.combine", { text: input({ Type: "Variable", VariableName: "Schrittzeilen" }), WFTextSeparator: "New Lines" });
  const sent = action("downloadurl", {
    WFURL: text(`${url.origin}/api/sync/health-energy/bulk`), WFHTTPMethod: "POST", WFHTTPBodyType: "JSON",
    WFHTTPHeaders: dictionary([["Authorization", tokens(["Bearer ", ref(secret, "Text")])]]),
    WFJSONValues: dictionary([["profileId", text(profileId)], ["sourceName", tokens([ref(source, "Text")])], ["sampleRows", tokens([ref(rows, "Combined Text")])], ["stepRows", tokens([ref(stepRows, "Combined Text")])]])
  });
  action("showresult", { Text: tokens(["FitFamily Alltag: ", ref(sent, "Contents of URL")]) });
  return {
    WFWorkflowName: `FitFamily Alltag v3 · ${profileId}`, WFWorkflowActions: actions,
    WFWorkflowClientVersion: "2600.0.0", WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: "900", WFWorkflowHasOutputFallback: false,
    WFWorkflowIcon: { WFWorkflowIconStartColor: 4282601983, WFWorkflowIconGlyphNumber: 59511 },
    WFWorkflowInputContentItemClasses: [], WFWorkflowOutputContentItemClasses: [], WFWorkflowTypes: [],
    // Configure the two existing Text actions after adding the shortcut. The
    // generated import questions repeatedly reopen on the user's Mac.
    WFWorkflowImportQuestions: []
  };
}
export function plist(value: Plist): string {
  const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  if (typeof value === "boolean") return value ? "<true/>" : "<false/>";
  if (typeof value === "number") return `<integer>${value}</integer>`;
  if (typeof value === "string") return `<string>${escape(value)}</string>`;
  if (Array.isArray(value)) return `<array>${value.map(plist).join("\n")}</array>`;
  return `<dict>${Object.entries(value).map(([key, item]) => `<key>${escape(key)}</key>${plist(item)}`).join("\n")}</dict>`;
}
export function energyInstaller(profileId: string, server: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0">${plist(buildEnergyShortcut(profileId, server))}</plist>`;
  // No shell interpolation of profile, server or credentials. XML is base64 data.
  return `#!/bin/bash
set -euo pipefail
umask 077
if [ "$(uname -s)" != Darwin ]; then echo "Bitte auf einem Mac ausführen."; exit 1; fi
if [ ! -x /usr/bin/shortcuts ]; then echo "Apples Kurzbefehle-App wird benötigt."; exit 1; fi
fitfamily_shortcut_dir="$(mktemp -d "\${TMPDIR:-/tmp}/FitFamily-Health.XXXXXXXX")"
echo "Erzeugt nur eine Vorlage mit Schlüssel-Platzhalter. Apple erhält sie zum Signieren."
echo '${Buffer.from(xml).toString("base64")}' | /usr/bin/base64 -D > "$fitfamily_shortcut_dir/FitFamily-Energie.unsigned.shortcut"
/usr/bin/plutil -convert binary1 "$fitfamily_shortcut_dir/FitFamily-Energie.unsigned.shortcut"
if ! /usr/bin/shortcuts sign --mode anyone --input "$fitfamily_shortcut_dir/FitFamily-Energie.unsigned.shortcut" --output "$fitfamily_shortcut_dir/FitFamily-Energie.signed.shortcut"; then
  echo "Apple-Signierung fehlgeschlagen. Keine importierbare Datei bestätigt. Vorlage: $fitfamily_shortcut_dir"
  exit 1
fi
test -s "$fitfamily_shortcut_dir/FitFamily-Energie.signed.shortcut"
echo "Signiert: $fitfamily_shortcut_dir/FitFamily-Energie.signed.shortcut"
echo "Jetzt in Kurzbefehle hinzufügen und Schlüssel/Datenquelle ergänzen. Danach iCloud-Sync auf Mac und iPhone einschalten; zuerst auf dem iPhone testen."
/usr/bin/open "$fitfamily_shortcut_dir/FitFamily-Energie.signed.shortcut"
`;
}
