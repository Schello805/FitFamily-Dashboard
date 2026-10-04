import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { healthMacApp } from "./health-mac-app";

it("bundles a valid executable Mac app without secrets or security bypasses", () => {
  const archive = healthMacApp("papa", "https://example.com");
  const inspected = spawnSync("python3", ["-c", `import io,sys,zipfile,json
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None
print(json.dumps({i.filename:{"mode":i.external_attr>>16,"text":z.read(i).decode()} for i in z.infolist()}))`], { input: archive, encoding: "utf8" });
  expect(inspected.status, inspected.stderr).toBe(0);
  const entries = JSON.parse(inspected.stdout);
  const root = "FitFamily-Kurzbefehl.app/Contents";
  expect(entries[`${root}/MacOS/FitFamily`].mode).toBe(0o100755);
  expect(entries[`${root}/Info.plist`].text).toContain("CFBundleExecutable");
  expect(entries[`${root}/Resources/install.command`].text).toContain("shortcuts sign --mode anyone");
  for (const path of [`${root}/MacOS/FitFamily`, `${root}/Resources/install.command`]) {
    expect(spawnSync("bash", ["-n"], { input: entries[path].text }).status).toBe(0);
    expect(entries[path].text).not.toMatch(/xattr|spctl|sudo/);
  }
  expect(entries["Bitte-lesen.txt"].text).toContain("nicht Developer-ID-signiert");
  expect(() => healthMacApp("papa;evil", "https://example.com")).toThrow();
});
