import { energyInstaller, plist } from "./health-shortcut";

// Small, uncompressed ZIP with Unix permissions, generated on Linux or macOS.
function zip(entries: { name: string; data: string; mode: number }[]) {
  const files: Buffer[] = [], directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), data = Buffer.from(entry.data);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6); local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x314, 4);
    central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((entry.mode * 65536) >>> 0, 38); central.writeUInt32LE(offset, 42);
    files.push(local, name, data); directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const end = Buffer.alloc(22), size = directory.reduce((sum, part) => sum + part.length, 0);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, ...directory, end]);
}

export function healthMacApp(profileId: string, server: string) {
  const installer = energyInstaller(profileId, server);
  const root = "FitFamily-Kurzbefehl.app/Contents";
  const info = `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0">${plist({
    CFBundleName: "FitFamily-Kurzbefehl", CFBundleDisplayName: "FitFamily-Kurzbefehl",
    CFBundleIdentifier: "de.fitfamily.shortcut-installer", CFBundlePackageType: "APPL",
    CFBundleExecutable: "FitFamily", CFBundleVersion: "1", CFBundleShortVersionString: "1.0",
    LSUIElement: true, NSHighResolutionCapable: true,
  })}</plist>`;
  const launcher = `#!/bin/bash
set -euo pipefail
umask 077
fitfamily_resources="$(cd "$(dirname "$0")/../Resources" && pwd)"
fitfamily_log="$(mktemp "\${TMPDIR:-/tmp}/FitFamily-Installation.XXXXXXXX")"
if /bin/bash "$fitfamily_resources/install.command" > "$fitfamily_log" 2>&1; then
  /usr/bin/osascript -e 'display dialog "Der Kurzbefehl wurde signiert und in Kurzbefehle geöffnet. Bitte hinzufügen und dort Familienschlüssel sowie Datenquelle eintragen." with title "FitFamily" buttons {"OK"} default button "OK"'
else
  /usr/bin/open -a TextEdit "$fitfamily_log"
  /usr/bin/osascript -e 'display dialog "Die Erstellung oder Apple-Signierung ist fehlgeschlagen. Das ausführliche Protokoll wurde geöffnet. Es wurde kein Erfolg bestätigt." with title "FitFamily" buttons {"OK"} default button "OK" with icon caution'
  exit 1
fi
`;
  return zip([
    { name: `${root}/Info.plist`, data: info, mode: 0o100644 },
    { name: `${root}/MacOS/FitFamily`, data: launcher, mode: 0o100755 },
    { name: `${root}/Resources/install.command`, data: installer, mode: 0o100644 },
    { name: "Bitte-lesen.txt", mode: 0o100644, data: "ZIP entpacken und FitFamily-Kurzbefehl.app öffnen. Keine Terminaleingabe nötig. Die App ist nicht Developer-ID-signiert oder notarisiert: macOS kann eine einmalige Freigabe unter Systemeinstellungen > Datenschutz & Sicherheit verlangen. Nur aus der eigenen FitFamily-App beziehen. Keine Sicherheitsfunktionen abschalten. Die Kurzbefehlsvorlage wird automatisch über Apple signiert; sie enthält keinen Familienschlüssel. Danach hinzufügen, Schlüssel/Datenquelle eintragen und auf dem iPhone testen.\n" },
  ]);
}
