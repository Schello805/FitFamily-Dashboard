# Installation auf Raspberry Pi

## Empfohlene Hardware

- Raspberry Pi 4 mit mindestens 4 GB RAM; Pi 3B wird funktional unterstützt
- Raspberry Pi OS 64 Bit mit Desktop
- Full-HD-Touchmonitor im Querformat
- Hochwertige SD-Karte und optional ein NAS für Backups

## 1. System vorbereiten

Node.js 22 LTS, Git und Chromium installieren. Anschließend das Repository nach `/opt/fitfamily` klonen und `npm ci` sowie `npm run build` ausführen. Das Skript `scripts/install-pi.sh` automatisiert Projekt-Build und systemd-Dateien; es benötigt sudo.

## 2. Konfiguration

`.env.example` nach `.env.local` kopieren und mindestens diese Werte ändern:

```dotenv
DATABASE_URL=file:./data/fitfamily.db
APP_URL=https://fitfamily.local
SESSION_SECRET=<mindestens-32-zufällige-zeichen>
NAS_BACKUP_PATH=/mnt/nas/fitfamily
BACKUP_ENCRYPTION_KEY=<langer-zufälliger-backup-schluessel>
```

OpenAI- und Gemini-Schlüssel sind optional.

## 3. Lokaler Name und HTTPS

Der Hostname des Raspberry Pi sollte `fitfamily` lauten. Für installierbare Web-App und Handy-Benachrichtigungen ist HTTPS erforderlich. Empfohlen ist Caddy mit einer internen Zertifizierungsstelle. Das lokale Stammzertifikat muss einmal auf den Familien-iPhones installiert und als vertrauenswürdig aktiviert werden.

Ohne HTTPS funktionieren Dashboard, Timer, QR und NFC im Heimnetz weiterhin über `http://fitfamily.local:3000`; PWA-Benachrichtigungen sind dann eingeschränkt.

## 4. Kioskmodus

Chromium mit `--kiosk --noerrdialogs --disable-infobars https://fitfamily.local` automatisch nach dem Desktop-Login starten. Mauszeiger nach kurzer Inaktivität ausblenden und Bildschirmschoner des Betriebssystems deaktivieren, da FitFamily den Ruhemodus selbst steuert.

## 5. NAS

Die NAS-Freigabe mit einem nur für Backups berechtigten Konto unter `/mnt/nas/fitfamily` einhängen. `fitfamily-backup.timer` führt täglich `npm run backup` aus. Aufbewahrung: sieben jüngste Sicherungen sowie repräsentative Wochen- und Monatssicherungen.

## 6. Erster Start

Nach dem Start zeigt der Monitor einen QR-Code. Mit einem Handy im selben WLAN scannen, Profildaten und Eltern-PIN einrichten und zum Dashboard zurückkehren.

## 7. Radio und Lautsprecher

PC-Lautsprecher oder ein Audioausgang des Monitors werden vom Raspberry Pi als Standardausgabe verwendet. Der Radio-Player im Dashboard spielt sechs Livestreams (1LIVE, 1LIVE DIGGI, ANTENNE BAYERN, ROCK ANTENNE, BAYERN 3 und BR24) direkt von den Sendern ab. Zusätzlich verweist ein Link zu den Sportschau-Audioreportagen an Spieltagen. Eine Upload-Funktion für Musikdateien gibt es nicht; für die Wiedergabe ist eine Internetverbindung nötig.

## Diagnose

```bash
sudo systemctl status fitfamily
sudo journalctl -u fitfamily -n 100 --no-pager
sudo systemctl status fitfamily-backup.timer
```
