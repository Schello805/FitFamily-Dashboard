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

## 5. Desktop-Icon & Kiosk-Modus (Vollbild)

Ein Klick auf das Desktop-Icon startet FitFamily direkt im Vollbild-Kiosk-Modus (ohne Adressleiste oder Browser-Tabs; Wischgesten für Vor/Zurück sind für Touchscreens deaktiviert).

Falls das Desktop-Icon noch nicht auf deinem Schreibtisch liegt, erstelle es mit folgendem Befehl:

```bash
sudo /opt/fitfamily/scripts/create-desktop-shortcut.sh
```

- **Starten:** Doppelklick auf das „FitFamily Dashboard“-Icon auf dem Desktop oder im Ubuntu-Anwendungsmenü (Super-Taste).
- **Kiosk-Modus beenden:** `Alt + F4` oder `F11`.
- **Hinweis unter GNOME:** Falls das Icon auf dem Schreibtisch noch gesperrt wirkt, mit der rechten Maustaste auf das Icon klicken und **„Starten erlauben“** (*Allow Launching*) anklicken.

Radio läuft über den Standard-Audioausgang des Lenovo. PC-Lautsprecher oder später angeschlossene externe Lautsprecher sollten in Ubuntu unter **Einstellungen → Ton** als Ausgabe ausgewählt sein. Der Player bietet sechs Livestreams und einen Link zu den Sportschau-Audioreportagen an Spieltagen; eine Musik-Upload-Funktion gibt es nicht. Zum Radiohören muss der PC mit dem Internet verbunden sein.

## Dienst bedienen

```bash
sudo systemctl status fitfamily
sudo systemctl restart fitfamily
sudo journalctl -u fitfamily -n 100 --no-pager
```

## Aktualisieren

Vor Updates zuerst eine Sicherung der Datenbank erstellen. Danach im Terminal:

```bash
cd /opt/fitfamily
sudo -u fitfamily git pull --ff-only
sudo -u fitfamily npm ci
sudo -u fitfamily npm run verify
sudo -u fitfamily npm run build
sudo systemctl restart fitfamily
```

Bei einem fehlgeschlagenen Test oder Build den Dienst nicht neu starten; so bleibt die laufende Version aktiv.
