#!/usr/bin/env node
// scripts/bump-version.mjs
// Inkrementiert die Patch-Version in package.json und synchronisiert version.json.
// Verwendung: node scripts/bump-version.mjs [patch|minor|major]
// Wird automatisch vor jedem Commit aufgerufen wenn in package.json als
// "precommit" script eingetragen und husky/simple-git-hooks gesetzt ist.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const pkgPath = path.join(rootDir, "package.json");
const versionPath = path.join(rootDir, "src", "lib", "version.json");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const level = process.argv[2] || "patch";

const [maj, min, patch] = pkg.version.split(".").map(Number);
let newVersion;
if (level === "major") newVersion = `${maj + 1}.0.0`;
else if (level === "minor") newVersion = `${maj}.${min + 1}.0`;
else newVersion = `${maj}.${min}.${patch + 1}`;

pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// version.json sofort mit aktuellem Commit synchronisieren
try {
  execSync("node scripts/generate-version.mjs", { cwd: rootDir, stdio: "inherit" });
} catch (e) {
  console.error("generate-version.mjs fehlgeschlagen:", e.message);
}

console.log(`[bump-version] ${pkg.name} → v${newVersion}`);
