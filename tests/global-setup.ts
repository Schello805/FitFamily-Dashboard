import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export default async function setup() {
  const testDirectory = await mkdtemp(path.join(tmpdir(), "fitfamily-tests-"));
  process.env.DATABASE_URL = `file:${path.join(testDirectory, "test.db")}`;
  delete process.env.NAS_BACKUP_PATH;
  delete process.env.BACKUP_ENCRYPTION_KEY;
  return async () => { await rm(testDirectory, { recursive: true, force: true }); };
}
