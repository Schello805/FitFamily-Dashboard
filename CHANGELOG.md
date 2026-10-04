# Änderungsprotokoll

Alle wichtigen Änderungen werden hier nach dem Prinzip von Keep a Changelog dokumentiert.

## [Unreleased]

## [0.3.19] – 2026-10-04

### Behoben

- Radio und Hell-/Dunkelmodus auf jeder Seite in einem gemeinsamen, oben fixierten Header statt unten schwebend. Breite Sender-/Liedanzeige, mobile Anordnung und fortlaufende Wiedergabe bleiben erhalten.
- Trainingsdialog erklärt die Auswahl als Schutz vor doppelter Trainingswertung. „Nein“ sperrt keine Health-Tagesdaten; kcal (und später Schritte) sind unabhängig. Der kcal-Kurzbefehl importiert keine Trainingszeiten.
- Doppelten Design-Schalter auf der Profilseite entfernt.

## [0.3.18] – 2026-10-04

### Neu

- Separate Tagesanzeige „Apple Health · aktive Energie“ (kcal) mit Datum. Fehlender Empfang bleibt leer; keine Punkte, Minuten, Ziele oder Level aus kcal.
- Familienschlüssel-geschützter kcal-Empfang: validierte Punkt-/Komma-Dezimaltexte, Tageswert ersetzen statt addieren, Fehlerprotokoll und Empfangskontrolle. Persistente Datenbank und JSON-Export/Import.
- Schritt-für-Schritt-Anleitung im Health-Menü für einen täglichen iPhone-Kurzbefehl. iPhone-Test noch erforderlich; Health-Zugriff bei Gerätesperre nicht garantiert.

### Behoben

- Dashboard-Punkte-Tooltip nennt Kraft 1, Ausdauer 2 und importierte Health-Trainings 1,5 Punkte/Minute korrekt.

## [0.3.17] – 2026-10-04

### Behoben

- Radio-Steuerung auf allen Seiten fest unten rechts: vierfach breite Desktop-Anzeige, sichtbarer Sender und Liedtitel auch mobil, vollständiger Titel als Tooltip. Bei geöffneten Modalen ausgeblendet; Wiedergabe bleibt bestehen.
- Seiten reservieren Platz für die Radioanzeige, damit sie keine unteren Inhalte verdeckt.

## [0.3.16] – 2026-10-04

### Neu

- Aufzeichnungsfrage bei Direktstart, Übung, KI-Plan und NFC/QR: Watch/Gymondo via Apple Health oder App-Timer. Health-Modus zählt keine App-Minuten, Punkte oder Level; Modus wird gespeichert und angezeigt.
- Echte Health-Trainingsbuchung mit `--book --send`: 1,5 Punkte pro aktiver Minute, Ziel-/Levelfortschritt und schreibgeschützter Verlauf. Testempfang bleibt unverändert ohne Wertung.
- Duplikat- und Überschneidungsschutz zwischen Health-Quellen, App-Zeiten, manuellen Nachträgen und Datenimport. Empfang zeigt Buchungen und Konflikte; keine automatische Gerätezuordnung.

### Behoben

- Hilfe nennt die tatsächlich geltende App-Wertung: Kraft 1, Ausdauer 2 Punkte/Minute.

## [0.3.15] – 2026-10-04

### Behoben

- KI-Trainingsplan-Kachel beginnt und endet auf Desktop auf gleicher Höhe wie Kraft und Ausdauer. Die Überschrift liegt außerhalb der gemeinsamen Kartenzeile; mobile Stapelung bleibt erhalten.

## [0.3.14] – 2026-10-04

### Behoben

- Health-Testskript akzeptiert auch `Export.xml` mit großem E im ZIP. Mehrdeutige Exporte bleiben blockiert; die Fehlermeldung nennt die direkte XML-Datei als Alternative.

## [0.3.13] – 2026-10-04

### Geändert

- Apple Health / Gymondo hat einen eigenen Verwaltungs-Menüpunkt, getrennt von Software-Updates und Speicherverwaltung.
- Verwaltungskopfzeile bleibt in allen Bereichen beim Scrollen sichtbar; die Desktop-Seitenleiste hält passenden Abstand darunter. Mobile Kopfzeile bleibt kompakt.

## [0.3.12] – 2026-10-04

### Behoben

- Update prüft Schreibrechte auf Laufzeitdaten und Leserechte auf Konfiguration und Release; das Release-Hauptverzeichnis ist für den Serveradministrator betretbar, ohne Schreibzugriff zu gewähren.
- Bei fehlgeschlagenem Neustart werden Dienststatus und Journal vor dem Rückwechsel ausgegeben. Der Status behält die konkrete Fehlerursache statt einer allgemeinen Gesundheitsprüfungs-Meldung.
- Update verwendet ausschließlich die vorhandene Verwaltungssitzung, ohne erneute PIN oder PIN im Update-Auftrag. Ubuntu-Dokumentation beschreibt aktuellen Release-Ablauf und Fehlerdiagnose.

## [0.3.11] – 2026-10-04

### Hinzugefügt

- Isolierter Apple-Health-/Gymondo-Trainingstest: Mac liest Workouts aus lokalem Health-XML/ZIP, zeigt eine Vorschau und sendet nur auf ausdrücklichen Wunsch einzelne Trainingszeiten.
- Ein gemeinsamer Familienschlüssel, Profilzuordnung per ID und sichtbarer Testempfang mit Import-ID, Quelle, Minuten und 1,5 Testpunkten pro Minute. Wiederholungen werden erkannt; bestehende Dashboard-Zähler bleiben unverändert.
- Testdaten sind in Backup und Datenexport berücksichtigt. Anleitung: `docs/HEALTH_TRAINING_TEST.md`. Produktive Aufzeichnungswahl und Punktewertung sind noch nicht aktiviert.

## [0.3.10] – 2026-10-04

### Geändert

- Ein Klick oder Touch auf den Profil-Avatar öffnet den Profileditor. Einstellungs-Abzeichen und Tastaturfokus machen die Funktion erkennbar; der doppelte Profil-Button entfällt.
- „Am Handy öffnen“ heißt im Profil und QR-Dialog jetzt „Handy verknüpfen“. Die Hilfe erklärt den neuen Avatar-Einstieg.

## [0.3.9] – 2026-10-04

### Geändert

- Dashboard: größere Avatare, 20 px Abstand zur Kopfzeile und inhaltsbreite Namensspalte mit gleichen Diagramm-Abständen statt pauschaler Verschiebung.
- Zielkreis als animierter SVG-Ring mit klarer Ziel-Beschriftung; Punkte nach einem Reset werden als „Punkte seit Reset“ angezeigt. Fortschritt und Werte wechseln weich, aktive Figuren bewegen sich dezent; reduzierte Bewegung wird respektiert.
- Hilfe erklärt Tages-/Wochenziel, Punktewertung, automatische Level-Schwellen und die Folgen von Reset bzw. Änderungen am Trainingsverlauf. Formeln bleiben unverändert und sind durch Zahlen- und Reset-Tests abgesichert.

## [0.3.8] – 2026-10-04

### Behoben

- Update-Erfolg setzt passende laufende Build-Revision und Versionsnummer voraus; Produktionsrevision bleibt die des gebauten Codes, auch nach einem späteren Git-Pull.
- Update-Auftrag wird nach Neuladen und erneuter PIN-Freigabe weiter überwacht. Fehlende, ungültige oder unlesbare Statusdateien melden keinen fiktiven laufenden Auftrag.
- Update-Worker erneuert nach erfolgreicher Prüfung die feste Liste root-eigener Systemhelfer mit Rücksetzung bei Austauschfehlern. Alte Serverhelfer benötigen einmalige Installation aus v0.3.8; siehe Betriebsdokumentation.
- Fehler beim Rückwechsel oder Dienststart werden ausdrücklich gemeldet; auch frühe Staging-Fehler erhalten einen Fehlerstatus.

## [0.3.7] – 2026-10-04

### Geändert

- Verwaltung prüft die Eltern-PIN automatisch nach der vierten Ziffer, auch bei eingefügter PIN. Der separate Entsperren-Button entfällt; doppelte Anfragen sind blockiert, Fehlversuche leeren die Eingabe für den nächsten Versuch.

## [0.3.6] – 2026-10-04

### Behoben

- Verlaufsdiagramme verwenden auf Dashboard und Detailansicht einheitliches Türkis statt der Profilfarbe. Neutraler Hintergrund und Fokusrahmen verhindern orange Diagramme im Dark Mode; Profilakzente bleiben außerhalb des Diagramms erhalten.

## [0.3.5] – 2026-10-04

### Geändert

- Automatischer Trainingslevel deutlich hervorgehoben, auch als Level-Abzeichen an der Figur; Fortschrittsanzeige erläutert die verbleibenden Minuten und gleiche Wertung von Kraft und Ausdauer.
- Manuelle Fitness-Selbsteinschätzung klar separat beschriftet. Sie steuert weiterhin die Figur, nicht den automatischen Trainingslevel.

## [0.3.4] – 2026-10-03

### Hinzugefügt

- Geräte-Auswertung pro Profil im Trainingsverlauf: sekundengenau summierte Zeit, Kraft-/Ausdauer-Anteile, Anzahl genutzter Einheiten und letzte Nutzung; auch noch nicht genutzte Geräte sind sichtbar.
- Geräte-Gesamtsummen umfassen die gesamte Historie unabhängig von der Begrenzung der Eintragsliste. Laufende Einheiten und Apple-Health-Daten zählen nicht mit; Geräte ohne Zuordnung bleiben separat.

## [0.3.3] – 2026-10-03

### Hinzugefügt

- Geräte- und Übungslinks für NFC sowie druckbare QR-Etiketten in Verwaltung → Sportraum.
- Änderbare Kraft-/Ausdauer-Zuordnung und Standardübung je Gerät, dauerhaft in Backup und Datenexport gespeichert.
- Mobile Trainingsseite mit Geräte-Timer und zentralem Stopp; Gerätewechsel schließen den vorherigen Abschnitt ohne Zeitlücke ab.
- Eigenständiger Trainingslevel mit Fortschrittsbalken und drei Abzeichen, unabhängig von Fitness-Selbsteinschätzung und Punkte-Reset.

### Behoben

- Gleichzeitige Scans desselben Profils erzeugen keine überlappenden Trainingsabschnitte mehr.
- PIN-Eingabe beim Handy-Koppeln verwendet das Numpad; Timer starten ohne Server-/Browser-Darstellungsfehler.
- Dashboard-Karten passen mit Fortschrittsanzeige auch bei 650 Pixeln Bildschirmhöhe in die Ansicht.

## [0.3.0–0.3.2] – 2026-10-03

### Geändert

- Apple Health vorerst eingestellt: Oberfläche, Ringe, Einrichtung und Generator entfernt; alte Sync-Endpunkte verweigern weitere Übertragungen mit HTTP 410.
- Fortschritt, Punkte, Trainingszeit und Diagramme berücksichtigen nur FitFamily-Training. Archivierte Health-Daten und Backup-Kompatibilität bleiben erhalten.
- Zwei Trainings-Einstiege im Profil: Kraft/Ausdauer direkt starten oder den persönlichen KI-Trainingsplan öffnen.

### Hinzugefügt

- Geräte-PDFs separat von Übungsvideos verwalten und in der Trainingseinheit anzeigen
- Automatische Browser-Aktualisierung nach App-Updates
- Lokales Dashboard und mobile Profilansicht
- Parallele Kraft- und Ausdauertimer
- NFC-Gerätewechsel und sichere QR-Übergabe
- Verlauf, manuelle Einträge und Trainingsplanerstellung
- Raspberry-Pi-, Datenschutz- und Sicherheitsgrundlagen

## [0.1.0] – 2026-09-30

- Initiales Projektgerüst.
