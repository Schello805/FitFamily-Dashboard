# Apple-Health-Sync über Kurzbefehle

FitFamily ist eine lokale Webapp und kann HealthKit nicht direkt aus dem Browser lesen. Auf dem iPhone übernimmt Apples Kurzbefehle-App den Transfer. Der vom Nutzer bereitgestellte iCloud-Kurzbefehl wurde geprüft und ist **nicht kompatibel und nicht datenschutzgerecht**: Er enthält eine Cloud-Modell/KI-Aktion und sendet nur ein KI-Ausgabefeld `data` an die API. FitFamily erwartet `profileId`, `secret` und `workouts`. Bitte diesen Kurzbefehl nicht starten und keine Health-Daten darüber senden. Erstelle einen neuen Kurzbefehl ohne KI-/Cloud-Aktionen.

## Vorbereitungen

1. iPhone und FitFamily-PC müssen im selben Heimnetz erreichbar sein. Verwende auf dem iPhone die IP-Adresse bzw. lokale Adresse des PCs, nicht `localhost`.
2. Öffne im gewünschten FitFamily-Profil **Apple Health**.
3. Tippe auf **Sync-Schlüssel erstellen** und bestätige die Eltern-PIN. Der Schlüssel wird einmal angezeigt und kopiert. Verliere ihn nicht; andernfalls musst du ihn erneuern und im Kurzbefehl ersetzen. Beim Erneuern wird der alte Schlüssel sofort ungültig.
4. Erlaube Kurzbefehle beim ersten Lauf den Zugriff auf die Health-Trainingsdaten.

Der Schlüssel berechtigt nur den Sync-Endpunkt dieses Profils. Speichere ihn nicht in öffentlichen Kurzbefehlen oder Nachrichten. **Schlüssel widerrufen** sperrt weitere Übertragungen. **Daten zurücksetzen** verlangt zusätzlich die Eltern-PIN, löscht importierte Health-Workouts und Aktivitätsringe und widerruft den Sync-Schlüssel.

## Kurzbefehl erstellen

Die Bezeichnungen können je nach iOS-Version leicht abweichen.

1. In **Kurzbefehle** einen neuen Kurzbefehl anlegen.
2. **Health-Proben suchen** / **Find Health Samples** hinzufügen und den Datentyp **Training/Workouts** auswählen. Für den ersten Test auf ein aktuelles Training begrenzen. Später den Zeitraum so setzen, dass seit dem letzten Lauf nichts verpasst wird; FitFamily überspringt bekannte Workouts.
3. **Wiederhole mit jedem** über die gefundenen Trainings legen. Innerhalb der Wiederholung ein **Wörterbuch** mit folgenden Feldern erstellen und jedes Wörterbuch zu einer Ergebnisliste hinzufügen:

   - `title`: Trainingsart aus dem aktuellen Health-Training
   - `startedAt`: Startdatum des aktuellen Trainings
   - `endedAt`: Enddatum des aktuellen Trainings
   - `id`: eindeutige Workout-ID, falls Kurzbefehle sie anbietet (empfohlen)
   - `type`: optional `strength` oder `endurance`; ohne Angabe erkennt FitFamily Kraftbegriffe im Titel und behandelt sonst die Einheit als Ausdauer
   - `calories`: aktive Workout-Kalorien, wenn Health sie bereitstellt
   - `distanceKm`: Workout-Distanz in Kilometern, wenn Health sie bereitstellt

   Falls Kurzbefehle die Datumswerte nicht als ISO-Datum in JSON übergibt, vor dem Wörterbuch jeweils **Datum formatieren** ergänzen: benutzerdefiniertes Format `yyyy-MM-dd'T'HH:mm:ssXXXXX`.

4. Nach **Ende der Wiederholung** **Inhalte von URL abrufen** hinzufügen. URL und Request-Body einstellen:

   - Methode: `POST`
   - Anforderungstext: `JSON`
   - `profileId`: die Profil-ID (zum Beispiel `papa`)
   - `secret`: der Sync-Schlüssel aus FitFamily
   - `workouts`: die Ergebnisliste aus der Wiederholung

   Workouts müssen echte Start- und Endzeitpunkte enthalten. Nur eine Dauer zu senden reicht absichtlich nicht: FitFamily erfindet keine Zeitstempel und importiert keine künstlichen Trainingseinheiten.

   URL: `http://<IP-ODER-LOKALE-ADRESSE>:3000/api/sync/apple-health` (die passende Adresse zeigt FitFamily im Profil).

5. Den Kurzbefehl einmal manuell ausführen und die Antwort prüfen. Danach kannst du ihn manuell starten oder – wenn deine iOS-Version und dein Gerät es anbieten – eine persönliche Automation ergänzen. Eine direkte, ständig laufende HealthKit-Synchronisation bietet die Webapp nicht.

## Verhalten und Datenschutz

### Tagesaktivität statt Rohdaten

Für Tageswerte sendet der Kurzbefehl nur zusammengefasste Zahlen für **heute**. Die folgenden Felder sind optional und stehen direkt neben `profileId` und `secret` im JSON-Objekt:

- `moveCalories`: aktive Energie in kcal
- `exerciseMinutes`: Trainingsminuten
- `standHours`: Stehstunden
- `stepCount`: Schritte als ganze Zahl
- `walkingRunningDistanceKm`: Geh-/Laufstrecke in Kilometern
- `flightsClimbed`: erklommene Etagen

Es ist nicht nötig, alle Felder in einem Lauf zu senden. Ein späterer Teil-Sync lässt nicht mitgesendete Tageswerte unverändert. Health-Proben bitte zuerst in Kurzbefehle zusammenfassen und nicht als hunderte einzelne Health-Objekte an den Webhook weiterreichen. Aktivitätswerte erzeugen keine Trainingspunkte.

- Doppelte Übertragungen werden anhand der Apple-Workout-ID erkannt; ohne ID anhand des Trainingsbeginns.
- Start- und Enddatum müssen gültig sein; Einheiten über 24 Stunden oder mit Start in der Zukunft werden abgewiesen.
- Punkte werden nach der FitFamily-Regel berechnet: Kraft 1 Punkt/Minute, Ausdauer 2 Punkte/Minute.
- Trainings allein erzeugen keine geschätzten Aktivitätsring-Werte. Ringe ändern sich nur, wenn echte Werte separat mitgesendet werden.
- Eingehende Syncs benötigen den individuellen Schlüssel; der gespeicherte Wert liegt nur als Hash in der lokalen Datenbank.
- Der Verbindungstest prüft nur den Schlüssel und schreibt keine Trainingseinheit.
- **Daten zurücksetzen & trennen** löscht Apple-Health-Workouts, zugehörige Segmente, Aktivitätsringe und Sync-Schlüssel atomar. Ein bereits laufender Import wird beim Schreiben nochmals gegen den Schlüssel geprüft; ein widerrufener Schlüssel kann danach keine neuen Daten importieren.
- Der Server kann nur die Kopie in FitFamily löschen. Er kann keine Daten aus Apple Health auf dem iPhone löschen oder Apple Health selbst die Berechtigung entziehen; das muss in iOS/Kurzbefehle separat erfolgen.

## Weitere Daten für Trainingsanpassung

Apple Health/HealthKit kennt darüber hinaus je nach Gerät und erteiltem Zugriff beispielsweise Ruhepuls, Herzfrequenzvariabilität (SDNN), VO₂max, Schlaf, Körpergröße/-gewicht, Geh-/Lauftempo, Schrittlänge und Schrittzahl. Diese Werte sind noch nicht alle Bestandteil des FitFamily-Syncs. Sie sollten als datierte Messreihen mit Einheit und Quelle gespeichert werden, nicht in das Tages-Ringe-Feld gequetscht. Ein daraus abgeleiteter Fitness-Trend kann Trainingspläne unterstützen, ist aber keine Diagnose und kein validiertes biologisches Alter. Bei Kindern keine Erwachsenen-Altersformel oder Rangliste verwenden.
