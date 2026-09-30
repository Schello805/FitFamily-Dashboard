# NFC einrichten

NFC-Tags enthalten einfache lokale URLs. Beispiel:

```text
https://fitfamily.local/nfc/pull-up
```

Beim ersten Scan fragt FitFamily, wem das Handy gehört, und verlangt den Eltern-PIN. Danach identifiziert dasselbe Handy automatisch das gekoppelte Profil.

## Tagliste

| URL-ID | Beschriftung | Typ |
|---|---|---|
| `pull-up` | Klimmzüge | Kraft |
| `push-up` | Liegestütze | Kraft |
| `sit-up` | Sit-ups | Kraft |
| `leg-raise` | Hängendes Beinheben | Kraft |
| `butterfly` | Butterfly | Kraft |
| `lat-pulldown` | Latzug | Kraft |
| `treadmill` | Laufband | Ausdauer |
| `vibration` | Vibrationsplatte | Kraft |
| `punchbag` | Boxsack | Ausdauer |
| `bike` | Fahrrad | Ausdauer |

Beide Laufbänder verwenden dieselbe URL-ID. Multifunktionsstationen erhalten je Übung einen eigenen Tag.

## Verhalten

- Ohne laufendes Training startet der Scan automatisch die passende Aktivität.
- Bei laufendem Training wird der vorherige Abschnitt beendet und der neue gestartet.
- Ein erneuter Scan derselben aktiven Übung verändert nichts.
- Ein Wechsel am Monitor oder Handy bleibt jederzeit möglich.
