import { readFile } from "node:fs/promises";
import { recoverDatabase, sanitizeRecoveredDatabase, snapshotDatabase, verifyDatabase } from "../src/lib/backup-format.mjs";

const [action, source, destination, keyFile] = process.argv.slice(2);
if (action === "snapshot" && source && destination) {
  await snapshotDatabase(source, destination);
} else if (action === "recover" && source && destination && keyFile) {
  const key = (await readFile(keyFile, "utf8")).trim();
  await recoverDatabase(await readFile(source), key, destination);
  console.log(`Geprüfte SQLite-Datenbank erstellt: ${destination}`);
} else if (action === "verify" && source) {
  await verifyDatabase(source, true);
} else if (action === "prepare-restore" && source) {
  await sanitizeRecoveredDatabase(source);
} else {
  throw new Error("Aufruf: node scripts/sqlite-maintenance.mjs snapshot file:quelle.db ziel.db | recover backup.db.enc neues-ziel.db schluessel.txt | verify datei.db");
}
