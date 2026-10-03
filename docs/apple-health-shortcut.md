# Fertige iPhone-Testvorlage

Erzeugen und auf einem Mac signieren:

```sh
node scripts/generate-health-shortcut.mjs --sign
```

Nach erfolgreicher Signierung liegt die korrigierte Datei unter `artifacts/FitFamily-Health-Sync-v4.signed.shortcut`.
Bei wiederholtem Fehler 502 im Modus `anyone` ist für die persönliche Übertragung alternativ `npm run health:shortcut -- --sign --sign-mode people-who-know-me` möglich. Dieser Apple-Modus fügt Kontaktinformationen des Erstellers hinzu und beschränkt die Nutzung auf Personen, die ihn in ihren Kontakten haben. Nur bewusst wählen; kein automatischer Fallback. Der Generator signiert in einem temporären Verzeichnis und übernimmt die Ausgabedatei ausschließlich nach erfolgreichem Abschluss.
Vorlage v4 korrigiert die Quell- und Formatparameter der Datumsaktion und verwendet für Einheitenumrechnungen ausschließlich ganzzahlige Zähler/Nenner statt locale-abhängiger Dezimalliterale. Die Versionen v1–v3 nicht mehr verwenden. Die Strukturtests ersetzen keinen Lauf auf dem iPhone; Datum und Tageswerte nach dem Import mit Health und dem Serverprotokoll vergleichen.
Version 3 korrigiert zusätzlich die vertauschten Zahlen-/Wörterbuchkennungen sowie
die Hülle für das verschachtelte Tageswörterbuch. Version 1 und 2 nicht weiterverwenden.
Version 2 korrigierte den auf dem iPhone bestätigten Importfehler der Wenn-Bedingung.
Alte Dateien werden nicht überschrieben. Die fünf Wenn-Aktionen benötigen eine
Variable-Parameterhülle, nicht die einfache Eingabehülle anderer Aktionen.
Sie wird nur bei erfolgreicher Signierung erzeugt. Beim ersten Erstellen am
3. Oktober 2026 schlug Apples Signierungsaufruf mit Zeitüberschreitung und zuletzt
`NSURLErrorDomain error 502` fehl. Die eingecheckte `.unsigned.shortcut` ist deshalb
**noch nicht als iPhone-importierbar bestätigt**. Den obigen Befehl später erneut
auf einem Mac ausführen; die unsignierte Datei alleine ersetzt die Signierung nicht.
Sie enthält nur einen Schlüssel-Platzhalter, keine echten Zugangsdaten.
Apple erhält bei der Signierung eine Kopie dieser Vorlage. Keine personalisierte
Datei mit echtem Schlüssel signieren oder öffentlich teilen.

Optional: `--profile papa --server http://192.168.1.253:3000 --output /tmp/FitFamily.unsigned.shortcut`.
Es gibt bewusst keine Option zum Einbetten eines echten Schlüssels.

## Auf dem iPhone

1. Signierte Datei per AirDrop oder Dateien-App öffnen und den Kurzbefehl hinzufügen.
2. Im ersten Textfeld den Platzhalter durch den Schlüssel aus deinem Profil ersetzen.
3. Profil-ID und Serveradresse in der letzten URL-Aktion kontrollieren.
4. Beim ersten Ausführen Health-Leserechte und Zugriff auf den eigenen Server erlauben.
5. Serverantwort mit Import-ID unter Verwaltung → Betriebsprotokoll → Apple Health vergleichen.

Die Vorlage liest fünf Arten separat mit Startdatum heute, prüft die Einheit pro
Messung und summiert ausschließlich numerische Werte. Distanz wird nach km,
Energie nach kcal und Training nach Minuten normalisiert. Schritte werden gerundet.
Ein leerer Fahrradtag erzeugt keinen Fehler; sein Ergebnis ist 0. Unbekannte Einheiten
brechen die Übertragung ab. Nur eine POST-Anfrage; keine Health-Schreibaktionen,
Cloud-KI oder Drittanbieter-Aktionen.

## Grenzen und notwendiger Test

Diese programmgenerierte Vorlage ist erst nach Import **und Ausführung auf dem
iPhone** funktional bestätigt. Signierung bestätigt nicht die Health-Parameter.
Die Health-Typbezeichnungen sind aus dokumentierten iPhone-Exporten übernommen;
OS-Versionen können andere Picker-Bezeichnungen oder Einheiten liefern.

Ein leeres Health-Ergebnis lässt sich nicht zuverlässig von verweigerten Leserechten
unterscheiden. Außerdem kann die Summe der Rohmessungen verschiedener Quellen
(z. B. Watch und iPhone) von Apples priorisierten Fitness-Tageswerten abweichen.
Vor automatischem Betrieb alle fünf Werte mit Apple Health/Fitness abgleichen.
Bei Abweichung nicht pauschal Faktoren ändern: zuerst Einheit, Quellen und
empfangene Werte im Protokoll prüfen. Stehminuten werden nicht übertragen, weil
sie keine erfüllten Stehstunden ergeben. Ringziele werden nicht ausgelesen.

## Schemaquellen

- [Apple: Kurzbefehle signieren](https://support.apple.com/guide/shortcuts-mac/apd455c82f02/mac)
- [Dokumentierte iPhone-Health-Exporte](https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/HEALTHKIT.md)
- [Parameter und numerische Variablen](https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/PARAMETER_TYPES.md)
- [Wenn-Bedingungen: spezielle Variablenhülle](https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/CONTROL_FLOW.md#input-rule-uniform-across-all-codes)
- [Cherri: Wörterbuchtypen (1 = Wörterbuch, 3 = Zahl)](https://cherrilang.org/compiler/file-format.html#dictionary-data-types)
- [Cherri: Verschachtelte Wörterbuchhüllen](https://github.com/electrikmilk/cherri/blob/main/shortcutgen.go)

Die Referenzen dienen als Syntaxevidenz; der Generator benötigt keine externen
Pakete oder Downloads. Im fertigen Kurzbefehl bleiben alle Health-Daten auf dem
iPhone, bis sie an die konfigurierte FitFamily-Adresse gesendet werden.
