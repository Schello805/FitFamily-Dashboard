# Sicherer Betrieb ab v0.2.96

## Bestehenden Ubuntu-PC einmalig umstellen

Die neuen Update- und NAS-Helfer benötigen eine einmalige Installation auf dem PC. Ein GitHub-Push allein installiert keine Systemdienste oder Zertifikate. Vorher die aktuelle Datensicherung und den zugehörigen Schlüssel getrennt sichern. Im vorhandenen Checkout unter `/opt/fitfamily`:

```bash
sudo git -C /opt/fitfamily pull --ff-only
cd /opt/fitfamily
sudo bash scripts/install-ubuntu.sh
```

Bei lokalen Git-Änderungen nicht zurücksetzen: den gemeldeten Konflikt zuerst prüfen. Die Installation behält Daten und Sitzungsschlüssel bei. Den bestehenden Betriebsmodus und dieselbe Adresse auswählen. Abhängigkeiten und Build laufen als `fitfamily`, nicht als root.

Neue Versionen werden unter `/opt/fitfamily/releases/` vorbereitet. Erst nach erfolgreichem Build wird der Dienst kurz gestoppt und ein konsistenter Datenbank-Snapshot erstellt. `current` wird atomar umgeschaltet. Die Prüfung ruft das Dashboard einschließlich Datenbank ab; bei Fehlern werden vorherige Version und Snapshot zurückgespielt. Die Verwaltung verfolgt einen eindeutigen Update-Auftrag und meldet einen Neustart nicht allein wegen einer unterbrochenen Verbindung als Erfolg.

Die root-eigenen Helfer liegen unter `/usr/local/libexec/`. Die Web-App darf ausschließlich die festen Update- und NAS-Aufträge ohne Argumente anstoßen; sie kann keinen beliebigen Systembefehl oder Mount-Pfad auswählen. Offline-Restore gehört nicht zu diesen sudo-Berechtigungen. Daten und Backups bleiben für den Dienst beschreibbar, Anwendungscode nicht.

## Touch am Wand-PC

Touchgeräte erhalten unabhängig von der Auflösung mindestens 48px hohe Schaltflächen und ein größeres PIN-Tastenfeld. Dialoge haben sichtbare Schließen-/Abbrechen-Tasten; Ruhemodus lässt sich durch Berühren beenden. Auf kurzen Bildschirmen bleibt vertikales Scrollen möglich, statt Daten abzuschneiden.

Die Ubuntu-GNOME-Kiosk-Einrichtung aktiviert die Bildschirmtastatur. Bei einer schon bestehenden Installation einmal `sudo bash /opt/fitfamily/scripts/setup-kiosk-autostart.sh` ausführen und die Texteingabe vor Ort prüfen. Unter anderen Desktop-Umgebungen oder wenn GNOME-Einstellungen nicht erreichbar sind, muss deren Bildschirmtastatur separat aktiviert werden. Browser-Tests auf dem Entwicklungsrechner ersetzen keinen Test des echten Touchpanels.

## HTTPS für iPhones

Dauerhafte Handy-Kopplung setzt in Produktion HTTPS voraus. HTTP-Kopplung meldet jetzt einen klaren Fehler, statt eine nicht gespeicherte Secure-Cookie-Verbindung als erfolgreich anzuzeigen. Dashboard und Kurzbefehle können im lokalen HTTP-Netz weiterhin verwendet werden; HTTP überträgt Daten unverschlüsselt.

Für einen ausschließlich lokalen Server kann Caddy eine interne Zertifizierungsstelle verwenden. Deren Stammzertifikat muss auf jedem zugreifenden Gerät vertrauenswürdig installiert sein ([Caddy-Dokumentation](https://caddyserver.com/docs/automatic-https#local-https)). Nur das öffentliche `root.crt` übertragen, niemals den privaten Schlüssel. Ein Hostname muss auf den Handys zur Server-IP auflösen; alternativ eine feste IP verwenden.

Auf einem dedizierten FitFamily-Server mit installiertem Caddy:

```bash
sudo apt install caddy
cd /opt/fitfamily
sudo bash scripts/setup-https.sh 192.168.1.253
```

Das Skript ersetzt die Caddy-Konfiguration und sichert deren vorherigen Stand. Bei einem gemeinsam genutzten Webserver die mitgelieferte Konfiguration stattdessen manuell integrieren. Die neue URL lautet im Beispiel `https://192.168.1.253` ohne Port 3000; QR/Kiosk/Health-Kurzbefehl entsprechend anpassen. Keine Portfreigabe im Internet einrichten. Node bindet nur an Loopback, während Caddy die HTTPS-Verbindung übernimmt; nur dann ist `TRUST_PROXY=true` zulässig. Die Firewall bleibt unverändert.

## Verschlüsselte Sicherung wiederherstellen

In **Verwaltung → Datensicherung** den Wiederherstellungsschlüssel herunterladen und getrennt von den NAS-Sicherungen aufbewahren. Ohne diesen Schlüssel lässt sich ein verschlüsseltes Backup nach Verlust der Datenbank nicht entschlüsseln. Alte Schlüssel für alte Sicherungen behalten.

Die Verwaltung kann eine `.db.enc`-Datei mit dem passenden Schlüssel prüfen und als `fitfamily-recovered.db` herunterladen. Alternativ im aktuellen Checkout:

```bash
node scripts/sqlite-maintenance.mjs recover backup.db.enc fitfamily-recovered.db schluessel.txt
```

Die Zieldatei muss neu sein; es wird keine laufende Datenbank überschrieben. Format, Verschlüsselung, SQLite-Integrität und Verknüpfungen werden geprüft. Alte Admin-Sitzungen und Handy-Kopplungen werden entfernt. Der vollständige Snapshot umfasst auch Tabellen, die nicht zum portablen JSON-Datenexport gehören.

Zum tatsächlichen Einspielen die geprüfte Datei in einen für `fitfamily` lesbaren Ordner kopieren, dann am Server:

```bash
sudo /usr/local/libexec/fitfamily-restore /pfad/fitfamily-recovered.db
```

Der Helfer sperrt gleichzeitige Updates, stoppt vor dem Snapshot die Schreibzugriffe, sichert die aktuelle Datenbank, spielt die geprüfte Datei ein und prüft das Dashboard. Bei Fehlern startet er den vorherigen Stand. Die entschlüsselte Datei enthält sensible Daten; geschützt aufbewahren. Nach der Wiederherstellung Admin erneut entsperren und Handys neu koppeln.
