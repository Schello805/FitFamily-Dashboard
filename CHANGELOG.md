# Änderungsprotokoll

Alle wichtigen Änderungen werden hier nach dem Prinzip von Keep a Changelog dokumentiert.

## [Unreleased]

## [0.3.38] – 2026-10-04

- Wochenkreis mit orangefarbenem Soll-Fortschritt bis zum aktuellen Wochentag (Montag 1/7 bis Sonntag 7/7) und „Bis heute“-Minuten. Trainingsfortschritt überdeckt Orange; bei erreichtem Tagesstand verschwindet es. Verglichen wird mit exakten Minuten, in der gewählten Anzeige-Zeitzone.

## [0.3.37] – 2026-10-04

- Zielkreis vom Punkte-Reset entkoppelt: alle vorhandenen Trainings des aktuellen Tages bzw. der Woche ab Montag zählen, auch bei früher gespeicherten Reset-Markierungen. Punkte-Reset setzt künftig ausschließlich die Punkte zurück.

## [0.3.36] – 2026-10-04

- NAS-Verbindung nach erfolgreichem Verbinden dauerhaft in root-geschützter Konfiguration gespeichert; eigener systemd-Dienst stellt sie nach Neustarts wieder her und wiederholt fehlgeschlagene Verbindungen. Gespeicherte Freigabe wird im Formular angezeigt; Passwort bei unveränderter Verbindung wiederverwendbar.

## [0.3.35] – 2026-10-04

- Deutlichere Rundung der Dashboard-Verlaufskurve mit längeren Bézier-Griffen; Datenpunkte und Lücken bleiben erhalten, ohne zusätzliche Spitzen.

## [0.3.34] – 2026-10-04

- Zusätzliche Verwaltungs-Kopfzeile entfernt. Logo und Dashboard-Button neben FitFamily im festen Header wiederhergestellt; Sperren in die Verwaltungsnavigation verschoben.

## [0.3.33] – 2026-10-04

- Ausgewähltes Design und Ruhemodus-Zeiten in der Verwaltung mit kräftigem Türkis, weißer Schrift, farbigem Rahmen und Häkchen hervorgehoben. Allgemeine Button-Stile überschreiben die Auswahlfarbe nicht mehr.

## [0.3.32] – 2026-10-04

- Trainingsdauer im Verlauf groß angezeigt. Karten füllen sich bis 60 Minuten mit einem Verlauf von Weiß über Grün bei 30 Minuten zu Orange bei 60 Minuten; längere Trainings bleiben voll und zeigen ihre tatsächliche Dauer.

## [0.3.31] – 2026-10-04

- Verlaufskarten mit kompakten Stift- und Papierkorb-Icons statt beschrifteter Aktionsbuttons; verständliche Tooltips und zugängliche Beschriftungen bleiben erhalten.

- Doppeltes PIN-Eingabefeld unter dem Zahlenblock entfernt. Die automatische Prüfung nach vier Ziffern bleibt bestehen.
- NFC-Zuordnung: fehlende Übungen direkt beim Gerät anlegbar; optionaler Übungs-Tag gehört zur ausgewählten Standardübung. Verwaltungsschrift zentral kompakter gestaltet.

## [0.3.30] – 2026-10-04

### Verbessert

- Persönlicher Verlauf: Health-Importe mit PIN bearbeitbar und aus Wertung/Verlauf entfernbar. Aktive Minuten bleiben getrennt vom Zeitfenster; Änderungen und Löschmarkierungen überstehen den erneuten Import derselben Datei.
- Punkte im Verlauf werden nach Änderungen aktualisiert; Dashboard-Minuten und automatische Level werden aus den korrigierten Einträgen berechnet. Laufende Einheiten müssen für die Bedienung im Verlauf zuerst gestoppt werden.
- Verlaufslinie optisch geglättet, ohne zusätzliche Spitzen, veränderte Datenpunkte oder Verbindungen über fehlende Tage.

## [0.3.29] – 2026-10-04

### Verbessert

- Verwaltungsformulare mit einheitlich gestalteten Auswahlfeldern, Fokusmarkierung, Touch-Bedienflächen und responsiven Formularrastern, einschließlich Health-Zielen und NFC-Links.
- NFC-Zuordnung lädt auch nachträglich angelegte Geräte, ignoriert verspätete Antworten vorheriger Geräte und bietet erneutes Laden der Übungen. Ungültige Standardübungen verlangen eine neue Auswahl; Leerzeichen in Gerätenamen verhindern keine Zuordnung mehr.
- Optionale Sticker-Bezeichnung speicherbar. Erklärung unterscheidet Bezeichnung, NFC-Geräte-Link und das Schreiben des physischen Stickers.

## [0.3.28] – 2026-10-04

### Neu

- Manueller Health-Export-Import direkt im Profil: ZIP/XML lokal und stückweise lesen, Zeitraum und Trainingsart prüfen, bis zu 25 Trainings je bestätigter Buchung. Nur Trainingszeiten verlassen das Handy; Duplikate und Überschneidungen bleiben gesperrt.
- KI-Plan-Übungen: zentrale Vorbereitungszeit 5/10/20/30/60 Sekunden (Standard 30), Töne bei 30 Sekunden Rest und in den letzten fünf Sekunden. Nächste Übung nur nach bewusstem Start; Vorbereitung und Wechsel ohne Wertung.
- Serverseitige Übungszeitgrenze und geschütztes Stoppen einer konkreten Sitzung verhindern zusätzliche Wertung bei verspätetem Browser-Timer. Laufender Übungsdialog bleibt geöffnet.
- Importfrage erklärt explizit den späteren manuellen Apple-Health-Export statt nur das Tragen der Watch.

## [0.3.27] – 2026-10-04

### Korrigiert

- Health-Download verwendet die Smartphone-erreichbare Serveradresse statt der internen Request-Origin. Bind-Adressen und Loopback-Ziele werden vom Generator abgelehnt; manuelle LAN-/HTTPS-Adresse bleibt möglich.

## [0.3.26] – 2026-10-04

### Neu

- Ein Mac-App-ZIP als Health-Download: entpacken und per Doppelklick starten; Vorlage erzeugen, Apple-Kurzbefehlsignierung und Import ohne Terminaleingabe. Fehler öffnen ein lokales Protokoll.
- Mac-App ist nicht Developer-ID-signiert/notarisiert; einmalige macOS-Freigabe bleibt erforderlich. Keine automatischen Gatekeeper-Umgehungen. Familienschlüssel bleibt außerhalb des Downloads.

## [0.3.25] – 2026-10-04

### Korrigiert

- Health-Kurzbefehl sammelt Energie- und Schrittzeilen in benannten Listen statt einer empfindlichen Wiederholungsergebnis-Verknüpfung. Wenn-/Stopp-Block entfernt; leere Daten werden weiterhin serverseitig abgelehnt und protokolliert.
- Vollständige Serverantwort statt gekürzter Mitteilung. Neuer Kurzbefehl heißt „FitFamily Alltag v2“; erster Lauf auf dem iPhone noch zu bestätigen.

## [0.3.24] – 2026-10-04

### Neu

- Schritte als zweite tägliche Health-Kennzahl ohne Wertung. Erweiterter Mac-Kurzbefehl überträgt Messwert-Texte derselben ausgewählten Quelle; Schrittwerte werden ersetzt, nicht addiert.
- Separater Health-Alltagsblock mit Energie, Schritten, Datum und klaren Leerzuständen; Trainingspunkte bleiben optisch getrennt.
- Schrittwerte bleiben bei reinen Energie-Uploads erhalten und werden in Backups mitgesichert.

## [0.3.23] – 2026-10-04

### Neu

- Manuelles kcal-Tagesziel, zunächst 500 pro Profil. Dashboard zeigt Ist/Ziel und Prozentwert ohne Wertung; Ziele sind im Health-Menü einstellbar und werden in den gesicherten Einstellungen gespeichert.

## [0.3.22] – 2026-10-04

### Korrigiert

- Eigene Avatar-Köpfe ohne Eltern-PIN erstellen, speichern und entfernen; Foto-Einwilligung, Herkunftsprüfung und KI-Limits bleiben erhalten.
- Energie-Kurzbefehl verknüpft Wiederholungsergebnisse korrekt mit „Text kombinieren“; erfolgreicher iPhone-Empfang bestätigt.

## [0.3.21] – 2026-10-04

### Korrigiert

- Health-Ereignisse im Betriebsprotokoll sichtbar, mit eigenem Übertragungsfilter und kopierbaren vollständigen Details.
- Energie-Übertragungen protokollieren empfangene Felder, begrenzte Messwert-Texte, Fehler und gespeichertes Ergebnis; Zugangsschlüssel bleiben ausgeschlossen.
- Mac-Kurzbefehl ohne wiederholten Import-Konfigurationsdialog; zwei vorbereitete Textfelder nach dem Hinzufügen ausfüllen.
- Eigene Kinderköpfe und Standardkopf-Ausblendung an die jeweilige Figur angepasst.

## [0.3.20] – 2026-10-04

### Neu

- Downloadbarer, profilbezogener Mac-Installer im Health-Menü: erzeugt eine vollständige Energie-Kurzbefehlvorlage, prüft und signiert sie mit Apples Werkzeugen und öffnet sie zum Import. Keine zusätzlichen Laufzeiten nötig.
- Schlüssel und Datenquelle erst beim Import ergänzen, keine echten Zugangsdaten im Download oder bei Apple-Signierung. iCloud-/AirDrop-Anleitung; persönlicher iPhone-Test weiter erforderlich.
- Sichere Energie-Auswertung von Dezimal-Messwerttexten einer ausgewählten Quelle auf dem Server. Keine Zahlenarithmetik im Kurzbefehl, keine Addition von Watch und iPhone, Tageswert ersetzen ohne Trainingswertung. Diese Quellensumme ist nicht automatisch Apples bereinigte Gesamtanzeige.

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
