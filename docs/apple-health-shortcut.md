# Apple Health: tägliche aktive Energie und Schritte per iPhone-Kurzbefehl

## Manueller Trainingsimport direkt im Profil (0.3.28)

Health → Profilbild → Alle Gesundheitsdaten exportieren → In Dateien sichern.
FitFamily → eigenes Profil → Health-Training importieren → ZIP/XML auswählen.
Zeitraum auswählen und lokale Vorschau laden. Profilzuordnung, Auswahl und Kraft/
Ausdauer prüfen, dann verbindlich buchen. Maximal 25 Trainings pro Buchung; danach
können weitere ausgewählt werden. Die komplette Datei bleibt auf dem Gerät; nur
bestätigte Trainingszeiten werden gesendet. Exporte bis 4 GiB werden stückweise
gelesen, jedoch kann die Verarbeitung auf älteren Handys länger dauern. Erster
echter iPhone-Dateiauswahl-/ZIP-Test noch erforderlich. Unbekannte Trainingsarten
müssen ausdrücklich zugeordnet werden. Duplikate und Überschneidungen mit bereits
gewerteter App-Zeit werden nicht zusätzlich gebucht. 1,5 Punkte pro aktiver Minute.

Beim Start beantwortest du „Importierst du dieses Training später manuell über
einen Apple-Health-Export?“: Ja = App-Zeit ohne Wertung, erst der Import zählt;
Nein = aktive App-Zeit zählt. kcal und Schritte bleiben separat und unbewertet.

## KI-Plan-Timer

Einheit starten → Vorbereitung → aktive erste Übung → automatisches Übungsende.
Die nächste Übung wartet auf „Nächste Übung starten“ und ihren eigenen Countdown.
Verwaltung → Anzeige/Ruhemodus → Vorbereitungszeit: 5/10/20/30/60 Sekunden.
Vorbereitung und Wechsel zählen nicht. Die Übungszeiten werden weiterhin gleichmäßig
aus der Einheit verteilt. Browser-Töne sind optional und können durch Gerätestumm-
oder Browsereinstellungen ausbleiben. Der Server begrenzt die Wertung auf die
gespeicherte Übungszeit auch bei geschlossenem Fenster; die nächste Serverabfrage
schließt eine abgelaufene Sitzung exakt zu dieser Zeit ab.

Ab 0.3.26 bietet die App einen einzigen ZIP-Download mit „FitFamily-Kurzbefehl.app“.
Entpacken und per Doppelklick starten, ohne Terminaleingabe. Die enthaltene Vorlage
wird auf dem Mac automatisch von Apples Kurzbefehle-Werkzeug signiert und geöffnet.
Diese Kurzbefehlsignierung ist keine Developer-ID-Signierung der Mac-App: Die
Mac-App ist nicht notarisiert und kann eine einmalige manuelle Freigabe unter
Datenschutz & Sicherheit verlangen. Es werden keine Sicherheitsfunktionen deaktiviert.
Fehler öffnen ein lokales Textprotokoll. Der Familienschlüssel wird erst nach dem
Import eingetragen. Der tatsächliche Finder-/Gatekeeper-Start eines heruntergeladenen
ZIPs muss auf dem Mac noch bestätigt werden; ZIP-Integrität und Skripte sind getestet.

Version 0.3.25 erzeugt „FitFamily Alltag v2“. Energie- und Schrittzeilen werden
ausdrücklich zu benannten Listen hinzugefügt und anschließend kombiniert. Keine
Wenn-/Stopp-Verzweigung; der Server lehnt leere oder ungültige Daten unverändert ab.
Die Serverantwort erscheint vollständig als Ergebnis. Bei einer täglichen Automation
muss diese Ergebnisanzeige gegebenenfalls nach dem ersten erfolgreichen Test entfernt
werden, damit sie nicht auf Bestätigung wartet. Den neuen Import zunächst auf dem
iPhone testen; ein Strukturtest ersetzt keinen Health-Lauf.

Aktive Energie ist ein kcal-Tageswert, einschließlich Alltagsbewegung. **Keine Punkte,
Trainingsminuten, Ziele, Gerätezeiten oder Level werden daraus berechnet.** Echte
Workouts aus dem Export bleiben separat; ihre bisherige Wertung bleibt erhalten.
Ab Version 0.3.24 liest der neu heruntergeladene Kurzbefehl zusätzlich Schritte.
Beide Werte werden aus derselben gewählten Datenquelle summiert, nicht aus allen
Quellen zusammen. Schritte haben keine Wertung. Fehlen Schritt-Messungen, bleibt
die Anzeige unbekannt statt 0; reine kcal-Uploads löschen vorhandene Schritte nicht.
Beim ersten iPhone-Lauf Schritte-Leserechte erlauben und Protokoll mit Health
vergleichen. Die neue Schritte-Abfrage ist noch auf dem iPhone zu bestätigen.
Alte Kurzbefehle für Schritte/Trainingsringe nicht wieder aktivieren. Wer nur kcal
synchronisiert, wählt beim Trainingsstart **„Nein · App-Trainingszeit werten“**, damit der
App-Timer Punkte erhält. „Ja“ bleibt nur für tatsächlich importierte Workouts.
Die Auswahl schaltet den Health-Empfang nicht aus: kcal und später Schritte werden
unabhängig davon synchronisiert. Für Schritte warten wir zunächst den erfolgreichen
kcal-Test auf dem iPhone ab; auch Schritte sollen ohne Wertung gespeichert werden.

## Einmal einrichten

### Empfohlen: fertige Mac-Datei herunterladen (ab v0.3.20)

1. In Verwaltung → Apple Health/Gymondo → „Fertigen Kurzbefehl auf dem Mac erstellen“
   dein Profil auswählen und **Mac-Skript herunterladen (.command)** anklicken.
   Die Serveradresse muss auf dem iPhone erreichbar sein, kein `localhost`.
2. Auf dem Mac im Terminal `bash ` (mit Leerzeichen) eingeben, die Datei aus
   Downloads hineinziehen, Enter drücken. Es werden nur Apples eingebaute Werkzeuge
   benötigt, kein npm, Python oder Projektordner. Alternativ die Datei ausführbar
   machen und doppelklicken; macOS-Sicherheitshinweise nicht blind umgehen.
3. Das Skript erstellt eine neue Datei in einem eigenen temporären Verzeichnis,
   prüft sie mit `plutil`, signiert sie mit `shortcuts sign --mode anyone` und öffnet
   erst bei Erfolg die signierte Datei. Apple bekommt beim Signieren die Vorlage,
   **noch ohne echten Familienschlüssel**. Kein automatischer Wechsel auf den
   Kontaktinformationen enthaltenden Modus „people-who-know-me“.
4. In Kurzbefehle **Kurzbefehl hinzufügen** bestätigen. Danach den Kurzbefehl
   bearbeiten und die beiden Textfelder ganz oben ersetzen: bekannter
   Familienschlüssel und exakter Name **einer aktuellen Energie-Datenquelle**
   aus Health → Aktive Energie → Datenquellen. Keine Import-Konfigurationsfragen:
   Diese öffneten sich auf dem getesteten Mac wiederholt statt abzuschließen.
   Alle Aktionen und Variablenverknüpfungen sind bereits vorbereitet.
5. Mac und iPhone: gleicher Apple-Account, iCloud-Synchronisierung in Kurzbefehle
   einschalten. Danach taucht der hinzugefügte Kurzbefehl auf dem iPhone auf.
   Dateiübertragung allein installiert ihn noch nicht. Als Alternative kann die
   signierte Datei per AirDrop aufs iPhone übertragen und dort hinzugefügt werden.
6. Auf dem iPhone zuerst manuell starten, Health-Leserechte erlauben und den echten
   Empfang in der App prüfen. Nur Energie von der gewählten Quelle wird auf dem
   Server summiert; keine Zahl wird in Kurzbefehle multipliziert oder umgewandelt.
   Der Wert ist **nicht automatisch die quellübergreifend bereinigte Fitness-
   Summe**. Mit der Tagesanzeige dieser Quelle vergleichen. Bei unbekanntem
   Quellennamen meldet die App die tatsächlich empfangenen Namen, statt 0 zu buchen.
7. Erst nach passendem Test eine tägliche Tageszeit-Automation auf dem iPhone
   einrichten. Persönliche Automationen sind ein separater Schritt, der nicht mit
   der Kurzbefehl-Datei installiert wird. Die Vorlage zeigt Ergebnisse per
   Mitteilung und wartet nicht auf „OK“. Server/WLAN und Health-Zugriff müssen
   verfügbar sein. Keine ausgefüllte Datei mit Schlüssel teilen.

Das Installer-Skript selbst liest keine Gesundheitsdaten und sendet keine kcal.
Der Health-Lauf erfolgt später auf dem iPhone. Erzeugung und Formatprüfung ersetzen
keinen echten iPhone-Test. Signierungsfehler von Apple werden als Fehler gemeldet;
eine unsignierte Datei wird nicht als erfolgreich importierbar bezeichnet.

### Alternative: Aktionen manuell anlegen

1. App auf mindestens v0.3.18 aktualisieren. In Verwaltung → Apple Health/Gymondo
   die Profil-ID prüfen (z. B. `papa`). Den vorhandenen Familienschlüssel verwenden.
   Nicht erneut erzeugen, wenn er bekannt ist: Ersetzen macht den alten ungültig.
2. iPhone → Kurzbefehle → neuer Kurzbefehl, Name `FitFamily – aktive Energie`.
3. Aktion **Aktuelles Datum** hinzufügen. Danach **Datum formatieren**,
   Datumsformat **Eigenes**, Formatzeichenfolge exakt `yyyy-MM-dd`, Sprache
   Englisch (USA). Ausgabe als Variable `Tag` speichern. Diesen Text nicht berechnen.
4. **Health-Messungen suchen**: Typ **Aktive Energie**, Startdatum **ist heute**,
   Einheit **kcal**, Gruppieren nach **Tag**, Fehlende ausfüllen **aus**,
   Beschränken **aus**. Gewünschte aktuelle Quelle auswählen, wenn mehrere Geräte
   dieselben Aktivitäten liefern. Kurzbefehle kann von der deduplizierten Fitness-
   Anzeige abweichen; vor der Automation gegen Health prüfen.
5. Wenn das Suchergebnis keinen Wert hat: **Kurzbefehl stoppen**. Fehlende
   Leserechte oder Messungen sind kein sicherer 0-Wert.
6. Sicherstellen, dass genau eine Tagesmessung zurückkommt. Falls mehrere:
   Quelle/Filter prüfen, nicht einfach die erste wählen. Aus dieser Messung
   **Wert** abrufen (**Details von Health-Messungen abrufen**). Danach eine
   **Text**-Aktion, deren Inhalt nur die magische Variable dieses Werts ist.
   Keine Einheit anfügen. Text-Ausgabe als Variable `AktiveKcalText` speichern.
   **Keine Summe, kein Runden, kein „mal 1“, keine Punkt/Komma-Ersetzung.**
7. Zum ersten Test den Text anzeigen und mit dem Tageswert in Health vergleichen.
   Erst bei passendem Ergebnis den folgenden Netzwerk-Schritt hinzufügen.
8. **Inhalte von URL abrufen**:
   - URL: `http://192.168.1.253:3000/api/sync/health-energy`
     (bei abweichender Serveradresse ersetzen; HTTPS bevorzugen).
   - Methode: **POST**.
   - Header `Authorization`: `Bearer DEIN_FAMILIENSCHLÜSSEL` (Leerzeichen nach Bearer).
   - Anfragetext: **JSON**, genau vier Felder:

   | Schlüssel | Typ | Wert |
   | --- | --- | --- |
   | `profileId` | Text | `papa` (bzw. die eigene Profil-ID) |
   | `date` | Text | Variable `Tag` aus Schritt 3 |
   | `activeEnergyKcal` | **Text** | Variable `AktiveKcalText` aus Schritt 6 |
   | `unit` | Text | `kcal` |

   Keine Roh-Health-Objekte, keine XML-Datei, keine Trainingsdaten mitsenden.
9. Zum ersten Test **Ergebnis anzeigen** hinter die URL-Aktion setzen. Erfolg
   enthält `ok: true`, Datum, gespeicherten kcal-Wert und `importId`. Bei Fehlern
   enthält die Antwort eine konkrete Meldung. In der Verwaltung **Empfang prüfen**:
   der gespeicherte Wert und das Protokoll müssen dazu passen.
10. Nach erfolgreichem manuellen Test die Test-Dialoge entfernen, damit sie die
    Automation nicht auf eine Bestätigung warten lassen. Im Fehlerfall kann eine
    Mitteilung gezeigt werden. Gesendete Schlüssel nie in Mitteilungen anzeigen.

Die App akzeptiert Zahlen oder Dezimaltext wie `343.391100000182` und
`343,391100000182`, ohne Tausendertrennzeichen. Werte außerhalb 0–20.000 kcal,
ungültige Tage, zukünftige Tage und andere Einheiten werden abgelehnt, nicht
automatisch korrigiert. Wiederholtes Senden ersetzt den Wert für Profil und Tag,
auch wenn Health einen niedrigeren korrigierten Wert liefert. Ein alter Tag wird
nicht als heutiger Wert dargestellt. Die Tageszuordnung ist Europe/Berlin;
bei Reisen den gewünschten Tag und die lokale Health-Abfrage ausdrücklich prüfen.

## Tägliche Automation

iPhone → Kurzbefehle → **Automation** → **+** → **Tageszeit** → beispielsweise
**22:00**, **täglich**, **Sofort ausführen** → den erstellten Kurzbefehl auswählen.
Das ist der bis dahin gemessene Tageswert, kein garantierter Endwert. Nach einem
späten Training kann der Kurzbefehl am selben Tag erneut manuell ausgeführt werden.

Das iPhone muss im eigenen WLAN sein (oder den Server über eine sichere private
Verbindung erreichen). Health-Leserechte einmal erlauben. **Ein gesperrtes iPhone
kann den Health-Zugriff verhindern**; täglicher Auslöser ist keine Erfolgsgarantie.
Erst nach erfolgreichem Test am eigenen iPhone ist der komplette Sync bestätigt.
Persönliche Automationen muss jede Person auf ihrem iPhone selbst anlegen.

Der Familienschlüssel erlaubt Zugriff für alle Profile. Nur im eigenen Kurzbefehl
speichern; Kurzbefehle nicht mit eingebettetem Schlüssel teilen. HTTP überträgt
Schlüssel und kcal unverschlüsselt im WLAN. Für geschützte Übertragung HTTPS nutzen.

Offizielle Grundlagen:

- [Apple: Automationen einrichten](https://support.apple.com/en-am/guide/shortcuts/apdfbdbd7123/ios)
- [Apple: Health-Datenschutz und Gerätesperre](https://support.apple.com/guide/security/protecting-access-to-users-health-data-sec88be9900f/web)
