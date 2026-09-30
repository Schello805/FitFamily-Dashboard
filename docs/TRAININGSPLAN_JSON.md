# Eigene Trainingspläne importieren

Im persönlichen Profil unter **Trainingsplan** kann eine JSON-Datei geladen werden. Eine ausfüllbare Beispieldatei gibt es direkt über **Vorlage**. Der Import funktioniert auch im Handy-Browser.

Die Datei muss die folgenden Felder enthalten:

- `title`: Titel des Plans
- `goal`: Ziel (optional)
- `targetDate`: Zieldatum im Format `JJJJ-MM-TT` oder `null`
- `summary`: kurze Beschreibung (optional)
- `weeks`: Wochen mit jeweils einer oder mehreren Trainingseinheiten
- jede Einheit: `title`, `type` (`strength` oder `endurance`), `minutes` und eine Liste `exercises`
- optional je Einheit: `date` (`JJJJ-MM-TT`) und `distanceKm`

Datum und Kilometer sind insbesondere für Lauf- und Fahrradpläne gedacht. Beispielwerte und das vollständige Format stehen in [`public/assets/trainingsplan-vorlage.json`](../public/assets/trainingsplan-vorlage.json). Die Datei darf höchstens 512 KB groß sein. Importierte Pläne werden lokal gespeichert; ein zuvor aktiver Plan wird archiviert.

PDF-Dateien werden noch nicht automatisch gelesen. Bei PDFs können Tabellen je nach Layout uneindeutig sein; deshalb nutzt FitFamily derzeit das strukturierte JSON-Format, damit Termine, Distanzen und Übungen verlässlich zugeordnet werden.
