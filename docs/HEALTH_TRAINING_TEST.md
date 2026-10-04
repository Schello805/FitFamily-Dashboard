# Apple Health / Gymondo: erster Trainingstest

Dieser Test überträgt ausschließlich einzelne Trainings mit Start, Ende, aktiver Dauer, Quelle und Trainingsart. Keine Schritte, Ringe, Kalorien oder anderen Messungen. 20 aktive Minuten ergeben 30 **Testpunkte** (1,5 pro Minute). Dashboard, Trainingslevel und bisherige Punkte bleiben unverändert. Die Auswahl „Zeichnest du dieses Training über Apple Health auf – mit der Apple Watch oder Gymondo?“ und die produktive Wertung folgen erst nach dem Test. Es gibt noch keine automatische Synchronisierung.

Gymondo muss das Training tatsächlich als Workout in Apple Health hinterlegt haben. Eine Verbindung allein genügt nicht. Aktive Workout-Dauer kann wegen Pausen von der Differenz zwischen Start und Ende abweichen und ist nicht mit den Trainingsminuten des Aktivitätsrings gleichzusetzen.

## Schritt für Schritt

1. App auf den neuen Stand aktualisieren. Unter **Verwaltung → System, Daten & Speicher → Apple Health / Gymondo · Trainingstest** den Familienschlüssel erstellen und einmal kopieren. Derselbe Schlüssel gilt für alle Profile; die dort angezeigte Profil-ID bestimmt die Zuordnung. Wer den Schlüssel kennt, kann für jedes Familienprofil Testdaten senden. Er ist daher privat zu halten. Erneutes Erstellen ersetzt den alten Schlüssel für alle Geräte.
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
5. In der Verwaltung **Testempfang prüfen** drücken. Profil, Import-ID, Quelle, Dauer und Testpunkte müssen zur Terminal-Antwort passen. Bei nochmaligem Senden desselben Trainings erscheint „bereits empfangen“. Es werden weiterhin keine echten Punkte gebucht.

Kein heutiges Workout bedeutet nicht automatisch null Trainingsminuten. Der Test sendet in diesem Fall nichts. Die Rohdaten aller Quellen werden nicht als Tagesgesamtsumme addiert. Als nächsten Schritt prüfen wir mit dem echten Ergebnis die Quellenüberschneidung, bevor die App-Aufzeichnung und die externe Aufzeichnung gegenseitig ausgeschlossen werden.

Testdatensätze bleiben bei Updates erhalten und sind im Datenexport enthalten. Der Schlüssel wird nur gehasht gespeichert; portable JSON-Exporte enthalten den Hash nicht. Die verschlüsselte vollständige Datenbanksicherung erhält ihn.

Offizielle Grundlagen: [Apple: Gesundheitsdaten als XML exportieren](https://support.apple.com/en-ca/guide/iphone/iph5ede58c3d/ios) und [HealthKit: aktive Workout-Dauer](https://developer.apple.com/documentation/healthkit/hkworkout/duration).
