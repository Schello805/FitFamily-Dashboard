import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHealthShortcut, METRICS, plist, SECRET_PLACEHOLDER } from "./generate-health-shortcut.mjs";

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

test("all five Health types are locked to today without a sample limit", () => {
  const finds = buildHealthShortcut().WFWorkflowActions.filter((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.filter.health.quantity");
  assert.equal(finds.length, 5);
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
  assert.equal(dictionaries.length, 10);
  for (const [index, action] of dictionaries.entries()) {
    const fields = action.WFWorkflowActionParameters.WFItems.Value.WFDictionaryFieldValueItems;
    for (const field of fields) {
      assert.equal(field.WFItemType, 3);
      assert.equal(field.WFValue.WFSerializationType, "WFTextTokenString");
      const literal = field.WFValue.Value.string;
      assert.match(literal, /^\d+$/);
      assert.equal(Number(literal), METRICS[Math.floor(index / 2)].factors[field.WFKey.Value.string][index % 2]);
    }
  }
});

test("normalizes units with metric-specific factors and valid operators", () => {
  assert.deepEqual(METRICS[3].factors.m, [1, 1000]);
  assert.deepEqual(METRICS[4].factors.mi, [1609344, 1000000]);
  assert.deepEqual(METRICS[1].factors.sec, [1, 60]);
  assert.equal(4184 * METRICS[0].factors.kJ[0] / METRICS[0].factors.kJ[1], 1000);
  assert.equal(4660 * METRICS[3].factors.m[0] / METRICS[3].factors.m[1], 4.66);
  const actions = buildHealthShortcut().WFWorkflowActions;
  const math = actions.filter((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.math");
  assert.equal(math.length, 15);
  assert.equal(math.filter((action) => action.WFWorkflowActionParameters.WFMathOperation === "×").length, 5);
  assert.equal(math.filter((action) => action.WFWorkflowActionParameters.WFMathOperation === "÷").length, 5);
  assert.equal(math.filter((action) => !("WFMathOperation" in action.WFWorkflowActionParameters)).length, 5);
  assert.equal(actions.filter((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.exit").length, 5);
});

test("date formatting uses the actual source date and dedicated custom pattern parameter", () => {
  const actions = buildHealthShortcut().WFWorkflowActions;
  const date = actions.find((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.date");
  const params = actions.find((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.format.date").WFWorkflowActionParameters;
  assert.equal(params.WFDateFormat, "Custom");
  assert.equal(params.WFDateFormatString, "yyyy-MM-dd");
  assert.equal(params.WFDate.Value.attachmentsByRange["{0, 1}"].OutputUUID, date.WFWorkflowActionParameters.UUID);
});

test("If conditions use the iPhone variable wrapper instead of an empty imported condition", () => {
  const actions = buildHealthShortcut().WFWorkflowActions;
  const guards = actions.filter((action) => action.WFWorkflowActionIdentifier === "is.workflow.actions.conditional" && action.WFWorkflowActionParameters.WFControlFlowMode === 0);
  assert.equal(guards.length, 5);
  for (const guard of guards) {
    const params = guard.WFWorkflowActionParameters;
    assert.equal(params.WFCondition, 101);
    assert.equal(params.WFInput.Type, "Variable");
    assert.equal(params.WFInput.Variable.WFSerializationType, "WFTextTokenAttachment");
    const source = actions.find((action) => action.WFWorkflowActionParameters.UUID === params.WFInput.Variable.Value.OutputUUID);
    assert.equal(source.WFWorkflowActionIdentifier, "is.workflow.actions.getvalueforkey");
    assert.equal(params.WFInput.Variable.Value.OutputName, "Dictionary Value");
  }
});

test("escapes plist text and rejects endpoints containing credentials or paths", () => {
  assert.equal(plist("<&"), "<string>&lt;&amp;</string>");
  assert.throws(() => buildHealthShortcut({ server: "http://secret@example.com" }));
  assert.throws(() => buildHealthShortcut({ server: "http://example.com/other" }));
  assert.throws(() => buildHealthShortcut({ profileId: "../papa" }));
  assert.ok(JSON.stringify(buildHealthShortcut({ profileId: "mama" })).includes("mama"));
});
