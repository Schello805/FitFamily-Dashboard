# Basistest: Schritte und Trainingsminuten

Die aktuelle Vorlage liest ausschließlich heutige Schritte und Trainingsminuten.
Sie heißt „FitFamily Schritte und Training“ und umfasst 43 statt 108 Aktionen.
Alte Fünf-Werte-Vorlagen nicht parallel automatisieren.

Erzeugen und auf einem Mac signieren:

```sh
node scripts/generate-health-shortcut.mjs --sign
```

Nach erfolgreicher Signierung liegt die Testdatei unter `artifacts/FitFamily-Schritte-Training-v1.signed.shortcut`.
Bei wiederholtem Fehler 502 im Modus `anyone` ist für die persönliche Übertragung alternativ `npm run health:shortcut -- --sign --sign-mode people-who-know-me` möglich. Dieser Apple-Modus fügt Kontaktinformationen des Erstellers hinzu und beschränkt die Nutzung auf Personen, die ihn in ihren Kontakten haben. Nur bewusst wählen; kein automatischer Fallback. Der Generator signiert in einem temporären Verzeichnis und übernimmt die Ausgabedatei ausschließlich nach erfolgreichem Abschluss.
Die Strukturtests ersetzen keinen Lauf auf dem iPhone. Datum und beide Tageswerte
nach dem Import mit Health und dem Serverprotokoll vergleichen. Die alte Vorlage
FitFamily Health Sync v1–v4 vorerst nicht weiterverwenden. Die unsignierte Vorlage
enthält nur einen Schlüssel-Platzhalter und lässt sich nicht auf dem iPhone öffnen.
Apple erhält bei der Signierung eine Kopie dieser Vorlage. Keine personalisierte
Datei mit echtem Schlüssel signieren oder öffentlich teilen.

Optional: `--profile papa --server http://192.168.1.253:3000 --output /tmp/FitFamily.unsigned.shortcut`.
Es gibt bewusst keine Option zum Einbetten eines echten Schlüssels.

## Auf dem iPhone

1. Signierte Datei per AirDrop oder Dateien-App öffnen und den Kurzbefehl hinzufügen.
2. Im ersten Textfeld den Platzhalter durch den Schlüssel aus deinem Profil ersetzen.
3. Profil-ID und Serveradresse in der letzten URL-Aktion kontrollieren.
4. Beim ersten Ausführen Health-Leserechte und Zugriff auf den eigenen Server erlauben.
5. Einmal starten, ohne zwischen Apps zu wechseln. Serverantwort mit Import-ID
   unter Verwaltung → Betriebsprotokoll → Apple Health vergleichen. `stepCount`,
   `exerciseMinutes` und Datum zusätzlich mit Health/Fitness zum selben Zeitpunkt prüfen.

Schritte: heutige Messungen → numerische Werte → einmal Summe. Training: heutige
Messungen → Einheit prüfen/normalisieren → einmal Summe. Ganzzahlige Zähler/Nenner
vermeiden Dezimal-Locale-Probleme. Schritte werden auf ganze Zahlen gerundet.
Fehlt das Datum oder eine Art heutiger Messungen, stoppt der komplette Basistest
ohne POST. Auch ein leerer Trainingstag wird deshalb nicht übertragen. Keine
erfundenen Nullen. Unbekannte Trainingseinheiten stoppen ebenfalls vor dem POST.
Genau eine POST-Anfrage mit zwei Werten; keine Health-Schreibaktionen, App-Wechsel,
Cloud-KI oder Drittanbieter-Aktionen.

## Grenzen und notwendiger Test

Diese programmgenerierte Vorlage ist erst nach Import **und Ausführung auf dem
iPhone** funktional bestätigt. Signierung bestätigt nicht die Health-Parameter.
Die Health-Typbezeichnungen sind aus dokumentierten iPhone-Exporten übernommen;
OS-Versionen können andere Picker-Bezeichnungen oder Einheiten liefern.

Ein leeres Health-Ergebnis lässt sich nicht zuverlässig von verweigerten Leserechten
unterscheiden. Außerdem kann die Summe der Rohmessungen verschiedener Quellen
(z. B. Watch und iPhone) von Apples priorisierten Fitness-Tageswerten abweichen.
Vor automatischem Betrieb beide Werte mit Apple Health/Fitness abgleichen.
Bei Abweichung nicht pauschal Faktoren ändern: zuerst Einheit, Quellen und
empfangene Werte im Protokoll prüfen. Stehminuten werden nicht übertragen, weil
sie keine erfüllten Stehstunden ergeben. Ringziele werden nicht ausgelesen.

„Verbindung prüfen“ im Profil erwartet weiterhin alle vier Kernfelder des vollen
Syncs und meldet bei diesem Teiltest fehlende Kalorien/Distanz. Maßgeblich für den
Basistest sind der erfolgreiche Import und die zwei Zahlen im Protokoll. Der
Teiltest ist keine Bestätigung des vollständigen Syncs.

## Schemaquellen

- [Apple: Kurzbefehle signieren](https://support.apple.com/guide/shortcuts-mac/apd455c82f02/mac)
- [Calculate Statistics: Sum](https://docs.scpl.dev/actions/calculatestatistics)
- [Dokumentierte iPhone-Health-Exporte](https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/HEALTHKIT.md)
- [Parameter und numerische Variablen](https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/PARAMETER_TYPES.md)
- [Wenn-Bedingungen: spezielle Variablenhülle](https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/CONTROL_FLOW.md#input-rule-uniform-across-all-codes)
- [Cherri: Wörterbuchtypen (1 = Wörterbuch, 3 = Zahl)](https://cherrilang.org/compiler/file-format.html#dictionary-data-types)
- [Cherri: Verschachtelte Wörterbuchhüllen](https://github.com/electrikmilk/cherri/blob/main/shortcutgen.go)

Die Referenzen dienen als Syntaxevidenz; der Generator benötigt keine externen
Pakete oder Downloads. Im fertigen Kurzbefehl bleiben alle Health-Daten auf dem
iPhone, bis sie an die konfigurierte FitFamily-Adresse gesendet werden.
