import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
const script = path.resolve("scripts/health-training-test.py");
it("reads only workouts and keeps active duration separate from elapsed time without locale arithmetic", () => {
  const code = `import importlib.util,io,sys,datetime
from zoneinfo import ZoneInfo
spec=importlib.util.spec_from_file_location('healthtest',sys.argv[1]); module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
xml=b'<HealthData><Record type="Steps" value="100000"/><Workout startDate="2026-01-01 12:00:00 +0100" endDate="2026-01-01 12:30:00 +0100" duration="20.5" durationUnit="min" sourceName="Gymondo" workoutActivityType="Strength"/></HealthData>'
records=module.read_workouts(io.BytesIO(xml),datetime.date(2026,1,1),ZoneInfo('Europe/Berlin'))
assert len(records)==1
assert records[0]['durationSeconds']==1230
assert records[0]['startedAt']=='2026-01-01T11:00:00Z'
assert set(records[0])=={'externalId','startedAt','endedAt','durationSeconds','sourceName','activityType'}
assert records[0]['durationSeconds']/60*1.5==30.75
again=module.read_workouts(io.BytesIO(xml),datetime.date(2026,1,1),ZoneInfo('Europe/Berlin'))
assert again[0]['externalId']==records[0]['externalId']
try: module.endpoint('https://example.com/?secret=x',False); raise AssertionError('unsafe URL accepted')
except ValueError: pass
try: module.endpoint('http://192.168.1.253:3000',False); raise AssertionError('HTTP accepted without consent')
except ValueError: pass
assert module.endpoint('http://192.168.1.253:3000',True).endswith('/api/sync/health-training-test')
try: module.read_workouts(io.BytesIO(b'<!DOCTYPE x [<!ENTITY x "bad">]><HealthData/>'),datetime.date(2026,1,1),ZoneInfo('Europe/Berlin')); raise AssertionError('entities accepted')
except ValueError: pass`;
  const result = spawnSync("python3", ["-B", "-c", code, script]);
  expect(result.status, result.stderr.toString()).toBe(0);
});

it("accepts capitalized Export.xml inside ZIP without accepting ambiguous exports", () => {
  const code = `import importlib.util,sys,tempfile,pathlib,zipfile,datetime
from zoneinfo import ZoneInfo
spec=importlib.util.spec_from_file_location('healthtest',sys.argv[1]); module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
xml=b'<HealthData><Workout startDate="2026-01-01 12:00:00 +0100" endDate="2026-01-01 12:30:00 +0100" duration="20.5" durationUnit="min" sourceName="Gymondo" workoutActivityType="Strength"/></HealthData>'
with tempfile.TemporaryDirectory(prefix='fitfamily-zip-test-') as folder:
    filename=pathlib.Path(folder)/'export.zip'
    for name in ['apple_health_export/Export.xml','apple_health_export/export.xml']:
        with zipfile.ZipFile(filename,'w') as archive:
            archive.writestr(name,xml)
            archive.writestr('apple_health_export/export_cda.xml',b'<irrelevant/>')
        records=module.load_export(filename,datetime.date(2026,1,1),ZoneInfo('Europe/Berlin'))
        assert len(records)==1 and records[0]['durationSeconds']==1230
    with zipfile.ZipFile(filename,'a') as archive: archive.writestr('another/Export.xml',xml)
    try: module.load_export(filename,datetime.date(2026,1,1),ZoneInfo('Europe/Berlin')); raise AssertionError('ambiguous exports accepted')
    except ValueError: pass`;
  const result = spawnSync("python3", ["-B", "-c", code, script]);
  expect(result.status, result.stderr.toString()).toBe(0);
});
