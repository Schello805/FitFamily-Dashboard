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

Ab v0.3.8 wird Erfolg zusätzlich gegen die tatsächlich laufende Build-Revision und Versionsnummer geprüft. Neuladen oder erneutes Entsperren nimmt die Überwachung desselben Auftrags wieder auf; fehlende oder beschädigte Statusdateien werden nicht als laufendes Update ausgegeben. Netzwerkunterbrechungen sind kein Erfolgsnachweis.

Nach dem ersten Update auf v0.3.8 (oder neuer) **einmal auf dem Ubuntu-Server** die alten, bereits installierten Helfer erneuern:

```bash
cd /opt/fitfamily/current
sudo ./scripts/install-privileged-helpers.sh
```

Der alte Worker kann diese Änderung beim ersten Upgrade noch nicht selbst ausführen. Ab dann erneuert der neue Worker die feste Helferliste aus der geprüften, root-eigenen Release-Version automatisch, nachdem Dashboard und Revision erreichbar sind. Die Helfer werden zusätzlich per HTTPS mit genau dieser GitHub-Revision verglichen: npm-Abhängigkeiten dürfen keine nachträglich geänderten Dateien als Root-Code einschleusen. Die Dateien werden vorab vollständig vorbereitet; bei einem Austauschfehler werden die vorherigen Helfer zurückgesetzt. Keine npm-Skripte laufen als root. Das ist kein Test auf dem echten Lenovo: Dienstneustart, sudoers und Rollback müssen dort zusätzlich geprüft werden.

## Touch am Wand-PC

Touchgeräte erhalten unabhängig von der Auflösung mindestens 48px hohe Schaltflächen und ein größeres PIN-Tastenfeld. Dialoge haben sichtbare Schließen-/Abbrechen-Tasten; Ruhemodus lässt sich durch Berühren beenden. Auf kurzen Bildschirmen bleibt vertikales Scrollen möglich, statt Daten abzuschneiden.

Die App öffnet auf großen Touch-Bildschirmen eine eigene Bildschirmtastatur für Text, E-Mail, Zahlen, Datum und Uhrzeit. Falls das Gerät Touch nicht korrekt meldet, das Eingabefeld auswählen und die sichtbare Taste **Tastatur** drücken. Änderungen erst mit **Übernehmen** bestätigen; **Abbrechen** lässt das Feld unverändert. Das Alter wird weiterhin aus dem Geburtsdatum berechnet; **Geburtsdatum ändern** führt zur Datumseingabe. Auf Handys bleibt die native Tastatur erhalten.

Die Ubuntu-GNOME-Kiosk-Einrichtung aktiviert zusätzlich die System-Bildschirmtastatur. Bei einer schon bestehenden Installation kann dafür einmal `sudo bash /opt/fitfamily/scripts/setup-kiosk-autostart.sh` ausgeführt werden. Die App-Tastatur benötigt diese Einrichtung nicht. Browser-Tests auf dem Entwicklungsrechner ersetzen keinen Test des echten Touchpanels.

## Zeitzone und automatisches Design

Unter **Verwaltung → Allgemein** ist **Europe/Berlin** voreingestellt und im Dropdown änderbar. Die Dashboard-Uhr, das Nachtruhe-Zeitfenster und **Auto (Tag/Nacht)** verwenden diese Zeitzone einschließlich Sommer-/Winterzeit. Auto zeigt während des eingestellten Nacht-Zeitfensters das dunkle Design, sonst das helle. Die ausdrücklich gewählten Designs **Hell** und **Dunkel** bleiben unabhängig von der Uhrzeit bestehen. Die Zeitzone ist auch im Datenexport und Backup enthalten.

## PDF-Geräteanleitungen

Unter **Verwaltung → Sportraum → Gerät bearbeiten** eine PDF auswählen und **Änderungen speichern** drücken. Auch beim Anlegen eines Geräts ist ein Upload möglich. Maximal 10 MiB pro PDF; ein vorhandener Web-Link kann alternativ weiterverwendet werden. Eine neue Auswahl wird erst beim Speichern übernommen. Die gespeicherte Anleitung kann geöffnet, ersetzt oder entfernt werden.

PDF-Inhalt und Dateiname liegen zusammen mit dem Gerät in der Server-Datenbank. Deshalb bleiben sie bei App-Updates erhalten und sind in den verschlüsselten SQLite-/NAS-Sicherungen sowie im JSON-Datenexport enthalten. Die Anleitung wird über eine relative App-Adresse ausgeliefert und bleibt beim Umzug auf einen anderen Server erreichbar. JSON-Importe sind bis 20 MiB möglich; größere Bestände über die vollständige Datensicherung wiederherstellen. Für verschlüsselte Backups über 50 MB den unten beschriebenen lokalen Wiederherstellungsbefehl verwenden.

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
