# FitFamily auf Ubuntu Desktop installieren

Diese Anleitung richtet FitFamily auf dem Lenovo All-in-One ein. Der PC ist dabei gleichzeitig Dashboard und lokaler Anwendungsserver; ein zweiter Server wird nicht benötigt. Er muss eingeschaltet und im Heimnetz sein, damit Handys die App erreichen.

## Voraussetzungen

- Ubuntu Desktop 22.04 oder neuer (64 Bit)
- Internetzugang zur Installation und für Wetter/KI-Optionen
- Verbindung zum Heimrouter, möglichst per Ethernet
- Touchmonitor oder Maus/Tastatur für die Ersteinrichtung

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

In `/opt/fitfamily/.env.local` die Zeile `APP_URL` auf diese Adresse setzen, zum Beispiel `APP_URL=http://192.168.1.42:3000`. Im Router sollte für den PC eine feste DHCP-Zuweisung eingerichtet werden, damit die Adresse gleich bleibt. Danach den Dienst neu starten:

```bash
sudo systemctl restart fitfamily
```

Auf dem Handy im selben WLAN die Adresse `http://192.168.1.42:3000` öffnen (mit der tatsächlichen PC-Adresse). Beim ersten Start erscheint der Einrichtungs-QR-Code. Die Eltern richten darüber die vier Profile und den Eltern-PIN ein.

Die Verbindung ist im Standardaufbau unverschlüsseltes HTTP. FitFamily deshalb nur im eigenen, vertrauenswürdigen WLAN verwenden und den Port 3000 nicht im Router zum Internet freigeben. Wenn die Ubuntu-Firewall aktiv ist, den Zugriff auf Port 3000 auf das private Heimnetz beschränken.

## 5. Touchmonitor, Autostart und Musik

Für die erste Einrichtung genügt der normale Ubuntu-Browser. Im Vollbildmodus blendet `F11` die Browserleisten aus. Optional lässt sich Chromium mit `--kiosk http://localhost:3000` als Anwendungsstart einrichten.

Musik wird im Dashboard hinzugefügt und über den Standard-Audioausgang des Lenovo abgespielt. PC-Lautsprecher oder später angeschlossene externe Lautsprecher sollten in Ubuntu unter **Einstellungen → Ton** als Ausgabe ausgewählt sein.

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
