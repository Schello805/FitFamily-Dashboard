import { expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { buildEnergyShortcut, energyInstaller, plist } from "./health-shortcut";
import { GET } from "@/app/api/admin/health-shortcut/route";

const auth = vi.hoisted(() => ({ reject: false }));
vi.mock("./security", () => ({ verifyAdminPinOrReject: async () => auth.reject ? new Response("Unauthorized", { status: 401 }) : null }));
vi.mock("./db", () => ({ db: async () => ({ execute: async ({ args }: { args: string[] }) => ({ rows: args[0] === "papa" ? [{ id: "papa" }] : [] }) }) }));

it("builds a complete text-only energy workflow without the looping import dialog", () => {
  const shortcut = buildEnergyShortcut("papa", "http://192.168.1.253:3000");
  const actions = shortcut.WFWorkflowActions as { WFWorkflowActionIdentifier: string; WFWorkflowActionParameters: Record<string, unknown> }[];
  const identifiers = actions.map(action => action.WFWorkflowActionIdentifier);
  expect(identifiers).not.toContain("is.workflow.actions.math");
  expect(identifiers).not.toContain("is.workflow.actions.statistics");
  const combine = actions.find(action => action.WFWorkflowActionIdentifier === "is.workflow.actions.text.combine")!;
  expect(combine.WFWorkflowActionParameters.text).toMatchObject({ WFSerializationType: "WFTextTokenAttachment", Value: { OutputName: "Repeat Results" } });
  expect(combine.WFWorkflowActionParameters.WFInput).toBeUndefined();
  expect(shortcut.WFWorkflowImportQuestions).toEqual([]);
  expect(actions[1].WFWorkflowActionParameters.WFTextActionText).toBe("FAMILIENSCHLUESSEL_HIER_EINFUEGEN");
  expect(actions[2].WFWorkflowActionParameters.WFTextActionText).toBe("EXAKTEN_HEALTH_DATENQUELLENNAMEN_EINFUEGEN");
  const uuids = new Set(actions.map(action => action.WFWorkflowActionParameters.UUID));
  for (const match of JSON.stringify(shortcut).matchAll(/"OutputUUID":"([^"]+)"/g)) expect(uuids.has(match[1])).toBe(true);
  expect(JSON.stringify(shortcut)).toContain("/api/sync/health-energy");
  expect(JSON.stringify(shortcut)).toContain("Bearer ");
  expect(JSON.stringify(shortcut)).not.toContain("exerciseMinutes");
  expect(JSON.stringify(shortcut)).not.toContain("stepCount");
  expect(JSON.stringify(shortcut)).toContain("stepRows");
  expect(JSON.stringify(shortcut)).toContain('"Value":"Steps"');
  expect(actions.filter(action => action.WFWorkflowActionIdentifier === "is.workflow.actions.text.combine")).toHaveLength(2);
  expect(plist("<&\"")).toBe("<string>&lt;&amp;&quot;</string>");
});
it("rejects injection and builds a self-contained Mac installer with no real secret", () => {
  for (const server of ["https://a/b", "file:///tmp/evil", "https://user:pass@example.com", "https://a/?key=x"]) expect(() => energyInstaller("papa", server)).toThrow();
  expect(() => energyInstaller("papa;touch x", "https://example.com")).toThrow();
  const installer = energyInstaller("papa", "https://example.com");
  expect(installer).toContain("shortcuts sign --mode anyone");
  expect(installer).toContain("/usr/bin/open");
  expect(installer).not.toContain("npm");
  expect(spawnSync("bash", ["-n"], { input: installer }).status).toBe(0);
  const base64 = installer.match(/echo '([A-Za-z0-9+/=]+)' \|/)!;
  const xml = Buffer.from(base64[1], "base64").toString();
  expect(xml).toContain("FAMILIENSCHLUESSEL_HIER_EINFUEGEN");
  expect(xml).toContain("EXAKTEN_HEALTH_DATENQUELLENNAMEN_EINFUEGEN");
  if (process.platform === "darwin") expect(spawnSync("/usr/bin/plutil", ["-lint", "-"], { input: xml }).status).toBe(0);
});
it("serves an authenticated downloadable installer for an existing profile only", async () => {
  auth.reject = true;
  expect((await GET(new Request("http://localhost/api/admin/health-shortcut?profileId=papa"))).status).toBe(401);
  auth.reject = false;
  expect((await GET(new Request("http://localhost/api/admin/health-shortcut?profileId=missing"))).status).toBe(404);
  expect((await GET(new Request("http://localhost/api/admin/health-shortcut?profileId=papa&server=file:///tmp/x"))).status).toBe(400);
  const result = await GET(new Request("http://localhost/api/admin/health-shortcut?profileId=papa&server=https://example.com"));
  expect(result.status).toBe(200);
  expect(result.headers.get("content-disposition")).toContain(".command");
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.text()).toContain("#!/bin/bash");
});
