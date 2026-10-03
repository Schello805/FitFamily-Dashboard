# Roadmap

## Version 1.0 – lokales Dashboard

- Touch- und Handybedienung, Profile und parallele Timer
- Score, Verlauf, DOSB-orientierte Bewegungsziele und Avatar-Level
- Trainingsplan-Editor, Dateiimport, KI-Vorschläge und Plananpassung
- NFC-Zuordnung, QR-Übergabe und Erinnerungen
- Übungsbibliothek mit ausführlichen Anleitungen und Illustrationen
- Elternbereich, Datenübersicht, Wiederherstellung und Ein-Klick-Updates
- Verschlüsselte NAS-Backups und vollständiger Export

## Offene Punkte – Profil- und Avatar-Kernfunktion

- [x] Kontomodell festlegen: lokale Familienprofile mit PIN-Schutz statt persönlicher E-Mail-Konten (siehe [docs/KONTOMODELL_UND_AVATARE.md](docs/KONTOMODELL_UND_AVATARE.md)).
- [x] Avatar-Erstellung in den Einrichtungsablauf integrieren: Person/Stil und selbst eingeschätzte Start-Fitness auswählen; Geburtsdatum und Profilzuordnung berücksichtigen.
- [x] Für jedes Avatar-Design passende Einzelbilder bereitstellen (transparente 222×444 WebP-Assets für alle Profile in `public/assets/avatars/`).
- [x] Trainingsart auswerten: Kraft- und Ausdauerminuten getrennt erfassen und daraus Fitnessstufe sowie Entwicklungsfokus ableiten.
- [x] Avatarentwicklung auch sichtbar im Körperdesign darstellen: Erwachsene erhalten passende Körper-Assets für Fitnessstufen 1–7 und kraft-/ausdauerbetonte Varianten; Kinder behalten ihre drei Stufen und zwei Designs ohne Körperformwechsel.
- [x] Start-Fitness und Entwicklung in verständliche Stufen übersetzen; die Regeln transparent und ohne medizinische Aussagen oder abwertende Körperlabels darstellen.
- [x] Avatar-Vorschau und Einstellungen im Profil anbieten, einschließlich späterer Anpassung der Start-Fitness.
- [x] Entwicklungsstufe auf Dashboard und Profil konsistent anzeigen und nach gespeicherten Trainings aktualisieren.
- [x] Migration und Standardwerte für bestehende Profile absichern; Setup, Profilbearbeitung, Avatar-Stufen und historische Trainingsdaten testen.
- [x] Bildgenerierung bzw. benötigte Bildrechte und den Asset-Workflow festlegen (dokumentiert in [docs/KONTOMODELL_UND_AVATARE.md](docs/KONTOMODELL_UND_AVATARE.md)).

## Aktueller Fokus – KI-Trainingsplan

- Direkte Trainingsstarts über Kraft und Ausdauer sowie persönliche KI-Trainingspläne.
- Trainingsqualität, verständliche Abläufe und zuverlässige lokale Fortschrittsberechnung.
- Apple Health ist vorerst eingestellt; eine erneute Anbindung ist nicht Teil der aktuellen Arbeit.

## Später denkbar

- Weitere Sprachen sind aktuell ausdrücklich nicht vorgesehen.
- Keine Kamera- oder Pose-Erkennung.
