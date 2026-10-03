import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { buildHealthShortcut, METRICS, plist, SECRET_PLACEHOLDER, signWithApple } from "./generate-health-shortcut.mjs";

test("retries Apple 500/502 once without changing the source or public signing mode", () => {
  for (const code of [500, 502]) {
    const calls = [];
    let preparations = 0;
    signWithApple({ source: "source", target: "target", mode: "anyone", report: () => {}, hasOutput: () => true,
      prepare: () => { preparations++; },
      run: (...args) => { calls.push(args); return calls.length === 1 ? { status: 1, stderr: `NSURLErrorDomain error ${code}.` } : { status: 0 }; }
    });
    assert.equal(calls.length, 2);
    assert.equal(preparations, 2);
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(calls[1][1][2], "anyone");
  }
});

test("never retries invalid files/timeouts or reports missing output as signed", () => {
  for (const result of [{ status: 1, stderr: "invalid format" }, { status: null, error: { code: "ETIMEDOUT" } }, { status: 0 }]) {
    let count = 0;
    assert.throws(() => signWithApple({ source: "source", target: "target", mode: "anyone", hasOutput: () => false, run: () => { count++; return result; } }), /Keine neue signierte Datei/);
    assert.equal(count, 1);
  }
});

test("stops after two transient failures", () => {
  let count = 0;
  assert.throws(() => signWithApple({ source: "source", target: "target", mode: "anyone", report: () => {}, hasOutput: () => false, run: () => { count++; return { status: 1, stderr: "NSURLErrorDomain error 500." }; } }), /500/);
  assert.equal(count, 2);
});

test("rejects unknown signing modes before generating or signing a file", () => {
  const result = spawnSync(process.execPath, ["scripts/generate-health-shortcut.mjs", "--sign-mode", "invalid"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Signierungsmodus muss/);
});

test("uses only built-in read actions and exactly one private-server POST", () => {
  const workflow = buildHealthShortcut();
  const actions = workflow.WFWorkflowActions;
  const requests = actions.filter((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.downloadurl");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].WFWorkflowActionParameters.WFHTTPMethod, "POST");
  assert.equal(requests[0].WFWorkflowActionParameters.WFURL.Value.string, "http://192.168.1.253:3000/api/sync/apple-health");
  assert.ok(actions.every((action) => action.WFWorkflowActionIdentifier.startsWith("is.workflow.actions.")));
  assert.ok(!actions.some((action) => /askllm|runjavascript|runshell|health.*log/.test(action.WFWorkflowActionIdentifier)));
  assert.ok(JSON.stringify(workflow).includes(SECRET_PLACEHOLDER));
});

test("only steps, exercise and active energy are locked to today without a sample limit", () => {
  const finds = buildHealthShortcut().WFWorkflowActions.filter((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.filter.health.quantity");
  assert.equal(finds.length, 3);
  assert.deepEqual(METRICS.map(({ key }) => key), ["exerciseMinutes", "stepCount", "moveCalories"]);
  assert.equal(METRICS[0].label, "Exercise Time");
  for (const [index, action] of finds.entries()) {
    const params = action.WFWorkflowActionParameters;
    assert.equal(params.WFContentItemLimitEnabled, false);
    const rows = params.WFContentItemFilter.Value.WFActionParameterFilterTemplates;
    assert.equal(rows[0].Values.Enumeration.Value, METRICS[index].label);
    assert.equal(rows[1].Property, "Start Date");
    assert.equal(rows[1].Operator, 1002);
    assert.ok(!("WFHealthQuantityType" in params));
  }
});

test("JSON carries typed numeric totals rather than raw Health objects", () => {
  const request = buildHealthShortcut().WFWorkflowActions.find((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.downloadurl");
  const body = request.WFWorkflowActionParameters.WFJSONValues.Value.WFDictionaryFieldValueItems;
  assert.deepEqual(body.map((item) => item.WFKey.Value.string), ["profileId", "secret", "dailyActivity"]);
  const day = body[2];
  assert.equal(day.WFItemType, 1);
  assert.equal(day.WFValue.WFSerializationType, "WFDictionaryFieldValue");
  assert.equal(day.WFValue.Value.WFSerializationType, "WFDictionaryFieldValue");
  const fields = day.WFValue.Value.Value.WFDictionaryFieldValueItems;
  assert.deepEqual(fields.map((item) => item.WFKey.Value.string), ["date", ...METRICS.map((metric) => metric.key)]);
  for (const field of fields.slice(1)) {
    assert.equal(field.WFItemType, 3);
    assert.equal(field.WFValue.Value.attachmentsByRange["{0, 1}"].Type, "Variable");
  }
  assert.ok(!JSON.stringify(body).includes("Health Samples"));
  assert.ok(!JSON.stringify(body).includes("standMinutes"));
});

test("conversion factors are number items (3), never dictionaries (1)", () => {
  const dictionaries = buildHealthShortcut().WFWorkflowActions.filter((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.dictionary");
  assert.equal(dictionaries.length, 4);
  for (const [index, action] of dictionaries.entries()) {
    const fields = action.WFWorkflowActionParameters.WFItems.Value.WFDictionaryFieldValueItems;
    for (const field of fields) {
      assert.equal(field.WFItemType, 3);
      assert.equal(field.WFValue.WFSerializationType, "WFTextTokenString");
      const literal = field.WFValue.Value.string;
      assert.match(literal, /^\d+$/);
      const metric = METRICS.filter(({ factors }) => factors)[Math.floor(index / 2)];
      assert.equal(Number(literal), metric.factors[field.WFKey.Value.string][index % 2]);
    }
  }
});

test("normalizes units with metric-specific factors and valid operators", () => {
  assert.deepEqual(METRICS[0].factors.sec, [1, 60]);
  assert.equal(480 * METRICS[0].factors.sec[0] / METRICS[0].factors.sec[1], 8);
  assert.equal(2 * METRICS[0].factors.hr[0] / METRICS[0].factors.hr[1], 120);
  assert.equal(4184 * METRICS[2].factors.kJ[0] / METRICS[2].factors.kJ[1], 1000);
  assert.deepEqual(METRICS[2].factors.kcal, [1, 1]);
  const actions = buildHealthShortcut().WFWorkflowActions;
  const math = actions.filter((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.math");
  assert.equal(math.length, 4);
  assert.equal(math[0].WFWorkflowActionParameters.WFMathOperation, "×");
  assert.equal(math[1].WFWorkflowActionParameters.WFMathOperation, "÷");
  const sums = actions.filter((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.statistics");
  assert.equal(sums.length, 3);
  assert.ok(sums.every((action) => action.WFWorkflowActionParameters.WFStatisticsOperation === "Sum"));
  assert.equal(sums[0].WFWorkflowActionParameters.Input.Value.OutputName, "Repeat Results");
  assert.equal(sums[1].WFWorkflowActionParameters.Input.Value.OutputName, "Value");
  assert.equal(sums[2].WFWorkflowActionParameters.Input.Value.OutputName, "Repeat Results");
  assert.ok(actions.length < 75);
});

test("date formatting matches the pattern confirmed in the iPhone editor", () => {
  const actions = buildHealthShortcut().WFWorkflowActions;
  const date = actions.find((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.date");
  const params = actions.find((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.format.date").WFWorkflowActionParameters;
  assert.equal(params.WFDateFormat, "yyyy-MM-dd");
  assert.ok(!("WFDateFormatString" in params));
  assert.equal(params.WFDate.Value.attachmentsByRange["{0, 1}"].OutputUUID, date.WFWorkflowActionParameters.UUID);
});

test("If conditions use the iPhone variable wrapper instead of an empty imported condition", () => {
  const actions = buildHealthShortcut().WFWorkflowActions;
  const guards = actions.filter((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.conditional" && action.WFWorkflowActionParameters.WFControlFlowMode === 0);
  assert.equal(guards.length, 6);
  for (const guard of guards) {
    const params = guard.WFWorkflowActionParameters;
    assert.equal(params.WFCondition, 101);
    assert.equal(params.WFInput.Type, "Variable");
    assert.equal(params.WFInput.Variable.WFSerializationType, "WFTextTokenAttachment");
    const source = actions.find((action) => action.WFWorkflowActionParameters.UUID === params.WFInput.Variable.Value.OutputUUID);
    assert.ok(["is.workflow.actions.getvalueforkey", "is.workflow.actions.format.date", "is.workflow.actions.filter.health.quantity"].includes(source.WFWorkflowActionIdentifier));
  }
});

test("missing samples stop before POST rather than fabricating zeros", () => {
  const actions = buildHealthShortcut().WFWorkflowActions;
  const finds = actions.filter((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.filter.health.quantity");
  for (const find of finds) {
    const index = actions.indexOf(find);
    assert.equal(actions[index + 1].WFWorkflowActionIdentifier, "is.workflow.actions.conditional");
    assert.equal(actions[index + 1].WFWorkflowActionParameters.WFInput.Variable.Value.OutputUUID, find.WFWorkflowActionParameters.UUID);
    assert.equal(actions[index + 3].WFWorkflowActionIdentifier, "is.workflow.actions.exit");
  }
  assert.ok(!actions.some((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.number"));
  assert.ok(!actions.some((action) => /openapp|waittoreturn/.test(action.WFWorkflowActionIdentifier)));
});

test("energy is previewed before JSON and rounded to whole kcal to avoid decimal locale parsing", () => {
  const actions = buildHealthShortcut().WFWorkflowActions;
  const rounds = actions.filter((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.round");
  assert.deepEqual(rounds.map((action) => action.WFWorkflowActionParameters.WFInput.Value.VariableName), ["stepCount", "moveCalories"]);
  assert.ok(rounds.every((action) => action.WFWorkflowActionParameters.WFRoundTo === "Ones Place"));
  const preview = actions.find((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.showresult" && action.WFWorkflowActionParameters.Text.Value.string.startsWith("Aktive Energie vor Rundung"));
  assert.ok(preview);
  const tokens = preview.WFWorkflowActionParameters.Text.Value.attachmentsByRange;
  assert.equal(Object.keys(tokens).length, 2);
  assert.ok(actions.indexOf(preview) < actions.findIndex((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.downloadurl"));
});

test("escapes plist text and rejects endpoints containing credentials or paths", () => {
  assert.equal(plist("<&"), "<string>&lt;&amp;</string>");
  assert.throws(() => buildHealthShortcut({ server: "http://secret@example.com" }));
  assert.throws(() => buildHealthShortcut({ server: "http://example.com/other" }));
  assert.throws(() => buildHealthShortcut({ profileId: "../papa" }));
  assert.ok(JSON.stringify(buildHealthShortcut({ profileId: "mama" })).includes("mama"));
});
