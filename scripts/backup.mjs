import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const source = process.env.DATABASE_URL?.replace(/^file:/, "") ?? "./data/fitfamily.db";
const target = process.env.NAS_BACKUP_PATH;
const secret = process.env.BACKUP_ENCRYPTION_KEY;

if (!target) throw new Error("NAS_BACKUP_PATH fehlt.");
if (!secret || secret.length < 16) throw new Error("BACKUP_ENCRYPTION_KEY muss mindestens 16 Zeichen lang sein.");

const absoluteSource = path.resolve(source);
await mkdir(target, { recursive: true });
const content = await readFile(absoluteSource);
const iv = randomBytes(12);
const key = createHash("sha256").update(secret).digest();
const cipher = createCipheriv("aes-256-gcm", key, iv);
const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
const tag = cipher.getAuthTag();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const filename = `fitfamily-${stamp}.db.enc`;
await writeFile(path.join(target, filename), Buffer.concat([Buffer.from("FFDB1"), iv, tag, encrypted]), { mode: 0o600 });

const files = (await readdir(target)).filter((name) => /^fitfamily-.*\.db\.enc$/.test(name)).sort().reverse();
const keep = new Set(files.slice(0, 7));
const weekly = new Set();
const monthly = new Set();
for (const name of files) {
  const match = name.match(/fitfamily-(\d{4})-(\d{2})-(\d{2})/);
  if (!match) continue;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
  const weekKey = `${date.getUTCFullYear()}-${Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 604800000)}`;
  const monthKey = `${match[1]}-${match[2]}`;
  if (weekly.size < 4 && !weekly.has(weekKey)) { weekly.add(weekKey); keep.add(name); }
  if (monthly.size < 12 && !monthly.has(monthKey)) { monthly.add(monthKey); keep.add(name); }
}
for (const name of files) if (!keep.has(name)) await unlink(path.join(target, name));
console.log(`Backup geschrieben: ${path.join(target, filename)}`);
