# Apple Health / Gymondo: Trainingszeiten und Wertung

Das Skript überträgt ausschließlich einzelne Trainings mit Start, Ende, aktiver Dauer, Quelle und Trainingsart. Keine Schritte, Ringe, Kalorien oder anderen Messungen. Ohne `--book` ist es weiterhin ein Test: 20 aktive Minuten ergeben 30 **Testpunkte**, ohne Änderung von Dashboard oder Level. Mit `--book --send` erfolgt eine echte Buchung mit **1,5 Punkten pro aktiver Minute**, unabhängig von Kraft/Ausdauer. Es gibt noch keine automatische iPhone-Synchronisierung.

Beim Start über Kraft/Ausdauer, Übung, Trainingsplan oder NFC/QR fragt die App: „Zeichnest du dieses Training mit der Apple Watch oder Gymondo über Apple Health auf?“ Bei **Ja** liefert der App-Timer weder Punkte noch Ziel-/Levelminuten. Er läuft nur zur Orientierung; Watch/Gymondo musst du separat starten/stoppen. Erst der später importierte Workout-Datensatz zählt. Bei **Nein** zählt der App-Timer wie bisher (Kraft 1, Ausdauer 2 Punkte/Minute). Ein Wechsel des Aufzeichnungsmodus beendet die vorherige App-Einheit und startet eine neue; Gerätewechsel mit gleichem Modus bleiben in derselben Einheit.

Gymondo muss das Training tatsächlich als Workout in Apple Health hinterlegt haben. Eine Verbindung allein genügt nicht. Aktive Workout-Dauer kann wegen Pausen von der Differenz zwischen Start und Ende abweichen und ist nicht mit den Trainingsminuten des Aktivitätsrings gleichzusetzen.

## Schritt für Schritt

1. App und Mac-Projekt auf den neuen Stand aktualisieren. Unter **Verwaltung → Apple Health / Gymondo** den Familienschlüssel erstellen und einmal kopieren. Ein bestehender Schlüssel bleibt gültig. Derselbe Schlüssel gilt für alle Profile; die dort angezeigte Profil-ID bestimmt die Zuordnung. Wer den Schlüssel kennt, kann für jedes Familienprofil Daten und echte Buchungen senden. Er ist daher privat zu halten. Erneutes Erstellen ersetzt den alten Schlüssel für alle Geräte.
2. Auf dem iPhone in Health auf das Profilbild und **Alle Gesundheitsdaten exportieren** tippen. Die ZIP-Datei per AirDrop auf den Mac übertragen, beispielsweise nach Downloads. Der Export enthält sensible Gesundheitsdaten: nicht in GitHub oder einen Chat hochladen. Das Skript liest ihn lokal und sendet nicht die Datei.
3. Im Terminal auf dem Mac zunächst nur die lokale Vorschau starten:

   ```sh
   cd /Users/michael/Programmerierung/Sportboard
   npm run health:test -- --file "/Users/michael/Downloads/export.zip" --profile papa
   ```

   Python 3.9 oder neuer wird benötigt. Es werden die letzten drei Workouts des heutigen Tages (Europe/Berlin) ausgewählt. Für einen anderen Tag `--date 2026-10-04`, für ein einzelnes Workout `--limit 1` ergänzen. Quelle, Beginn und aktive Minuten mit dem konkreten Training in Health vergleichen. Überlappende Watch-/Gymondo-Aufzeichnungen werden gemeldet, aber noch nicht automatisch zusammengeführt.
4. Stimmen die Vorschauwerte, ausdrücklich senden:

   ```sh
   npm run health:test -- --file "/Users/michael/Downloads/export.zip" --profile papa --limit 1 --send --allow-http
   ```

   Den Familienschlüssel bei der verdeckten Abfrage einfügen und Enter drücken. Er erscheint nicht im Terminal oder in der Befehlszeile. Standardziel ist `http://192.168.1.253:3000`. HTTP überträgt Schlüssel und Trainingszeiten unverschlüsselt; nur im vertrauenswürdigen lokalen Netzwerk verwenden. Für HTTPS `--server https://DEIN-SERVER` statt `--allow-http` nutzen. Weiterleitungen werden nicht verfolgt.
5. In der Verwaltung **Empfang prüfen** drücken. Profil, Import-ID, Quelle, Dauer und Testpunkte müssen zur Terminal-Antwort passen. Bei nochmaligem Senden desselben Trainings erscheint „bereits empfangen“. Es werden weiterhin keine echten Punkte gebucht.

## Echte Buchung

Zuerst die Buchung **lokal** prüfen (Datum gezielt wählen):

```sh
npm run health:test -- --file "/Users/michael/Downloads/apple_health_export/Export.xml" --profile papa --date 2025-08-31 --limit 1 --book
```

Stimmen Trainingsart, Zeit und Profil, denselben Befehl mit `--send --allow-http` ergänzen. Für HTTPS die oben beschriebene Serveroption verwenden. In der Verwaltung muss **Echte Buchung**, **Gebucht** und die tatsächliche Punktzahl stehen. Vorherige Testempfänge werden nicht automatisch umgewandelt; ein erneutes ausdrückliches Senden mit `--book` ist nötig.

Kraft- und Ausdauerarten werden nur bei eindeutigen Health-Typen zugeordnet (z.B. StrengthTraining oder Cycling). Unbekannte/gemischte Arten benötigen ausdrücklich `--type strength` oder `--type endurance`; das Skript rät nicht. Gleichzeitige Watch-/Gymondo-Datensätze werden nicht zusammengerechnet. Identische IDs sind Duplikate; zeitlich überlappende andere IDs oder bereits gezählte App-Segmente sind Konflikte und werden nicht gebucht. Bei mehreren Trainings kann ein Empfang teilweise buchen; deshalb **saved**, **alreadyReceived**, **conflicts** und jede Tabellenzeile prüfen. Auch manuelle Nachträge dürfen bereits gebuchte Health-Zeiten nicht zusätzlich zählen.

Gebuchte aktive Minuten zählen für Ziele, Verlauf, Kraft/Ausdauer-Auswertung und den automatischen Level. App-Timer im Health-Modus bleiben ohne Wertung sichtbar. Importierte Trainings sind im Verlauf schreibgeschützt. Eine Gerätezuordnung lässt sich aus diesen Workout-Zeiten nicht sicher ableiten: Geräteauswertungen enthalten daher nur gewertete App-Zeiten, keine geschätzten Health-Geräteminuten. Bei Trainings über Mitternacht oder über einen Reset wird die aktive Dauer proportional zum Zeitfenster verteilt; genaue Pausenzeiten sind im verwendeten Datensatz nicht bekannt. Das Dashboard zeigt ganze Punkte, Restbruchteile bleiben rechnerisch erhalten.

Kein heutiges Workout bedeutet nicht automatisch null Trainingsminuten. Das Skript sendet in diesem Fall nichts. Die Rohdaten aller Quellen werden nicht als Tagesgesamtsumme addiert.

Testdatensätze, echte Buchungen und Aufzeichnungsmodi bleiben bei Updates erhalten und sind im Datenexport enthalten. Alte App-Einheiten behalten den Modus App. Der Schlüssel wird nur gehasht gespeichert; portable JSON-Exporte enthalten den Hash nicht. Die verschlüsselte vollständige Datenbanksicherung erhält ihn.

Offizielle Grundlagen: [Apple: Gesundheitsdaten als XML exportieren](https://support.apple.com/en-ca/guide/iphone/iph5ede58c3d/ios) und [HealthKit: aktive Workout-Dauer](https://developer.apple.com/documentation/healthkit/hkworkout/duration).
