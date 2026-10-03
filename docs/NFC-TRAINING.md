# Training mit NFC und QR

## Einrichtung

1. FitFamily über eine stabile HTTPS-Adresse öffnen und diese als `APP_URL` auf dem Server eintragen. Handy und Server müssen im selben WLAN oder über VPN erreichbar sein.
2. In **Verwaltung → Sportraum → NFC & QR** das Gerät auswählen. Laufband und Ergometer haben standardmäßig Ausdauer, alle anderen Geräte Kraft. Die Auswahl ist änderbar.
3. Eine aktive Standardübung für das Gerät auswählen und **Zuordnung speichern** drücken. Geräte ohne Übungen benötigen zuerst eine Übung.
4. **NFC-Link kopieren**: diesen Link als NDEF-URL auf einen beschreibbaren NFC-Tag schreiben. An Metallgeräten On-Metal-Tags verwenden.
5. **QR-Etikett drucken**: den identischen Link als QR-Code am Gerät befestigen. Unter „Zusätzlicher Tag“ gibt es Links für einzelne Übungen.
6. Das Handy beim ersten Scan mit dem eigenen Profil koppeln (Eltern-PIN). Immer denselben Browser und dieselbe Serveradresse verwenden. Private Browserfenster merken sich die Kopplung nicht dauerhaft.

Am iPhone die nach dem Scan angezeigte NFC-Mitteilung antippen. Dann öffnet sich FitFamily und startet das Training. Der Tag enthält keine PIN und kein persönliches Token.

## Verhalten

- `/scan/geraet/<id>` startet die hinterlegte Standardübung mit der Trainingsart des Geräts.
- `/scan/uebung/<id>` startet die konkrete Übung mit der Trainingsart des zugeordneten Geräts.
- Ein Gerätewechsel beendet den bisherigen Zeitabschnitt und startet den nächsten mit demselben Zeitstempel. Die Trainingseinheit bleibt zusammenhängend.
- Wiederholtes Scannen derselben Übung setzt den Timer nicht zurück.
- Gerät oder Übung nicht verfügbar: Fehlermeldung; das bisherige Training bleibt unverändert.
- Stopp auf dem Handy oder im Profil auf dem Wanddisplay beendet dieselbe serverseitige Einheit. Die Zeit läuft auch bei gesperrtem Handy weiter. Die bestehende Vier-Stunden-Grenze bleibt aktiv.
- Ältere `/nfc/<exerciseId>`-Links führen weiterhin zum neuen Ablauf.
- Die Zuordnungen sind in der Datenbank unter `settings` gespeichert; sie gehören zu Backup/Restore sowie Datenexport. Ein wiederhergestelltes Backup verlangt aus Sicherheitsgründen eine erneute Handy-Kopplung.

## Trainingslevel

Der Trainingslevel ist unabhängig von der Fitness-Selbsteinschätzung und dem Punktestand. Eine abgeschlossene Kraftminute und eine abgeschlossene Ausdauerminute zählen jeweils als eine Fortschrittsminute. Laufende Einheiten zählen erst nach Abschluss oder Sicherheitspause. Vorhandene lokale Trainings werden berücksichtigt; archivierte Apple-Health-Daten nicht.

| Level | Gesamte Trainingsminuten |
|---|---:|
| 1 | 0 |
| 2 | 150 |
| 3 | 450 |
| 4 | 900 |
| 5 | 1.500 |

Schwelle für Level L: `150 × (L − 1) × L / 2`, maximal Level 50. Unterminuten werden vor der Anzeige summiert und erst am Ende abgerundet. Abzeichen: erste abgeschlossene Einheit, zehn abgeschlossene Einheiten und 1.000 Trainingsminuten. Der Punkte-Reset ändert den Trainingslevel nicht; Änderungen oder Löschen von Trainingshistorie können ihn ändern.
