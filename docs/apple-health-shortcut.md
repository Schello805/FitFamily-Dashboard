# Apple Health: tägliche aktive Energie per iPhone-Kurzbefehl

Aktive Energie ist ein kcal-Tageswert, einschließlich Alltagsbewegung. **Keine Punkte,
Trainingsminuten, Ziele, Gerätezeiten oder Level werden daraus berechnet.** Echte
Workouts aus dem Export bleiben separat; ihre bisherige Wertung bleibt erhalten.
Alte Kurzbefehle für Schritte/Trainingsringe nicht wieder aktivieren. Wer nur kcal
synchronisiert, wählt beim Trainingsstart **„Nein · FitFamily zählt“**, damit der
App-Timer Punkte erhält. „Ja“ bleibt nur für tatsächlich importierte Workouts.

## Einmal einrichten

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
