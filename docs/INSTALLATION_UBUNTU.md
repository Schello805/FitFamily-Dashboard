# FitFamily auf Ubuntu Desktop installieren

Diese Anleitung richtet FitFamily auf dem Lenovo All-in-One ein. Der PC ist dabei gleichzeitig Dashboard und lokaler Anwendungsserver; ein zweiter Server wird nicht benötigt. Er muss eingeschaltet und im Heimnetz sein, damit Handys die App erreichen.

## Voraussetzungen

- Ubuntu Desktop 22.04 oder neuer (64 Bit)
- Internetzugang zur Installation und für Wetter/KI-Optionen
- Verbindung zum Heimrouter, möglichst per Ethernet
- Touchmonitor oder Maus/Tastatur für die Ersteinrichtung

## Schnellinstallation (One-Liner)

Auf dem Ubuntu-PC ein Terminal öffnen und folgenden Befehl ausführen. Er installiert automatisch alle Voraussetzungen (Node.js 22, Git, OpenSSL), lädt FitFamily nach `/opt/fitfamily`, richtet die lokale Konfiguration ein und startet FitFamily dauerhaft als Hintergrunddienst:

```bash
curl -fsSL https://raw.githubusercontent.com/Schello805/FitFamily-Dashboard/main/scripts/setup-ubuntu.sh | sudo bash
```

Danach läuft FitFamily automatisch und ist sofort unter `http://localhost:3000` erreichbar.

---

## Manuelle Schritt-für-Schritt-Installation

Alternativ zur Schnellinstallation können die Schritte auch einzeln ausgeführt werden:

## 1. Benötigte Pakete installieren

Terminal öffnen und Git, curl und OpenSSL installieren:

```bash
sudo apt update
sudo apt install -y curl git openssl
```

FitFamily benötigt Node.js 22 oder neuer. Für Ubuntu kann Node.js 22 über das NodeSource-Paketarchiv eingerichtet werden:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
sudo -E bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
node --version
npm --version
```

Die Node-Version muss mindestens `v22` anzeigen.

## 2. Projekt herunterladen

```bash
sudo mkdir -p /opt/fitfamily
sudo chown "$USER":"$USER" /opt/fitfamily
git clone https://github.com/Schello805/FitFamily-Dashboard.git /opt/fitfamily
cd /opt/fitfamily
```

## 3. Lokalen Dienst installieren

```bash
sudo ./scripts/install-ubuntu.sh
```

Das Skript legt den eingeschränkten Systembenutzer `fitfamily` an, erstellt bei Bedarf eine lokale Konfiguration samt geheimem Sitzungsschlüssel, baut die App und startet sie als Dienst. Die Datenbank bleibt im Ordner `/opt/fitfamily/data/`.

Der Dienst startet künftig automatisch mit Ubuntu. Am Lenovo kannst du FitFamily im Browser unter `http://localhost:3000` öffnen.

## 4. Handy im Heimnetz verbinden

Am PC im Terminal die lokale IPv4-Adresse ermitteln:

```bash
hostname -I
```

Der Einrichtungs-QR-Code verwendet automatisch die Adresse, unter der der Monitor geöffnet wurde. Wenn du den Monitor z. B. unter `http://192.168.1.42:3000` öffnest, zeigt der QR-Code dieselbe IP-Adresse. Alternativ kannst du in `/opt/fitfamily/.env.local` `APP_URL=http://192.168.1.42:3000` als feste Adresse setzen. Im Router sollte für den PC eine feste DHCP-Zuweisung eingerichtet werden, damit die IP gleich bleibt. Nach einer Änderung an `.env.local` den Dienst neu starten:

```bash
sudo systemctl restart fitfamily
```

Auf dem Handy im selben WLAN die Adresse `http://192.168.1.42:3000` öffnen (mit der tatsächlichen PC-Adresse). Beim ersten Start erscheint der Einrichtungs-QR-Code. Die Eltern richten darüber die vier Profile und den Eltern-PIN ein.

Die Verbindung ist im Standardaufbau unverschlüsseltes HTTP. FitFamily deshalb nur im eigenen, vertrauenswürdigen WLAN verwenden und den Port 3000 nicht im Router zum Internet freigeben. Wenn die Ubuntu-Firewall aktiv ist, den Zugriff auf Port 3000 auf das private Heimnetz beschränken.

## 5. Vollbild-Kiosk & Autostart beim PC-Start

FitFamily kann so eingerichtet werden, dass sich der PC nach dem Einschalten **vollautomatisch anmeldet** (ohne Passworteingabe) und das Dashboard **sofort im Vollbild-Kiosk-Modus** startet.

### Kiosk & Autostart mit einem Befehl aktivieren:

Öffne ein Terminal auf dem Ubuntu-PC und führe aus:

```bash
sudo /opt/fitfamily/scripts/setup-kiosk-autostart.sh
```

Dieses Skript richtet vollautomatisch ein:
1. **Automatischer Login (Auto-Login):** Ubuntu bootet direkt auf die Benutzeroberfläche, ohne am Sperrbildschirm auf ein Passwort zu warten.
2. **Kiosk-Autostart:** Sobald der Desktop geladen ist, startet der Kiosk-Launcher automatisch und wartet, bis der Hintergrunddienst bereit ist.
3. **Optimierter Touch-Kiosk:** Chromium/Chrome öffnet sich im Vollbild ohne störende Leisten, Wischgesten oder Absturzwarnungen.
4. **Dauerhafter Bildschirm:** Das automatische Abschalten des Monitors nach 5 Minuten Inaktivität wird deaktiviert.
5. **Desktop-Shortcut:** Legt ein anklickbares FitFamily-Icon auf dem Desktop und im Anwendungsmenü ab.

### Bedienung im Alltag:
- **PC einschalten:** Nach dem Hochfahren erscheint direkt das FitFamily Dashboard im Vollbild.
- **Kiosk-Modus beenden / minimieren:** `Alt + F4` oder `F11` auf der Tastatur drücken.
- **Kiosk manuell starten:** Doppelklick auf das „FitFamily Dashboard“-Icon auf dem Schreibtisch.
- **Hinweis unter GNOME:** Falls das Schreibtisch-Icon gesperrt wirkt, Rechtsklick darauf und **„Starten erlauben“** (*Allow Launching*) wählen.

Radio läuft über den Standard-Audioausgang des Lenovo. PC-Lautsprecher oder später angeschlossene externe Lautsprecher sollten in Ubuntu unter **Einstellungen → Ton** als Ausgabe ausgewählt sein. Der Player bietet sechs Livestreams und einen Link zu den Sportschau-Audioreportagen an Spieltagen; eine Musik-Upload-Funktion gibt es nicht. Zum Radiohören muss der PC mit dem Internet verbunden sein.

## Dienst bedienen

```bash
sudo systemctl status fitfamily
sudo systemctl restart fitfamily
sudo journalctl -u fitfamily -n 100 --no-pager
```

## Aktualisieren (Updates einspielen)

FitFamily bietet zwei bequeme Möglichkeiten für Updates. Bei beiden Methoden wird **vorab automatisch eine Sicherungskopie der SQLite-Datenbank** unter `backups/` gespeichert.

### Methode 1: Direkt im Browser (1-Click Update)
1. Öffne das Dashboard und wechsle zu **Verwaltung** (`/verwaltung`).
2. Entsperre den Bereich mit deinem Eltern-PIN.
3. Im Bereich **„Software-Update“** siehst du sofort, ob eine neue Version auf GitHub verfügbar ist.
4. Klicke auf **„1-Click Update einspielen“**. Die Änderungen werden im Hintergrund geladen, installiert, gebaut und der Dienst startet nahtlos neu.

### Methode 2: Über das Terminal (Automatisiert)
Im Terminal des Ubuntu-PCs einfach folgenden Einzeiler ausführen:

```bash
sudo /opt/fitfamily/scripts/update.sh
```
*(Alternativ im Projektordner: `npm run update`)*

Das Skript führt vollautomatisch folgende Schritte durch:
1. Datenbank-Backup anlegen (`backups/fitfamily-backup-pre-update-*.db`)
2. Neueste Version von GitHub laden (`git fetch origin main && git reset --hard origin/main`)
3. Abhängigkeiten aktualisieren (`npm install`)
4. Dashboard neu bauen (`npm run build`)
5. Hintergrunddienst neu starten (`systemctl restart fitfamily`)

> [!TIP]
> **Falls ein Server auf einer alten Revision festhängt:** Einmalig im Terminal `sudo /opt/fitfamily/scripts/repair.sh` ausführen, um veraltete Sperren aufzuheben.

Deine Einstellungen in `.env.local` und alle Trainingsdaten bleiben dabei vollständig erhalten.

## NAS-Backups & Datensicherung

Die NAS-Verbindung für Backups wird nicht mehr über die CLI oder Konfigurationsdateien eingerichtet, sondern bequem und intuitiv direkt im Dashboard:

1. Öffne die **Verwaltung** (`/verwaltung`) und gib deinen Eltern-PIN ein.
2. Im Bereich **„NAS-Datensicherung“** gibst du deinen lokalen Einhängepfad ein (z. B. `/mnt/nas/fitfamily` oder einen gemounteten SMB/NFS-Share).
3. Mit **„Verbindung testen“** prüfst du direkt die Schreibrechte.
4. Mit **„Jetzt sichern“** kannst du jederzeit eine verschlüsselte Sicherung (AES-256-GCM) anstoßen.
5. Vorhandene Backups werden automatisch nach dem Rotationsprinzip (7 Tage, 4 Wochen, 12 Monate) gepflegt.

