#!/usr/bin/env python3
"""Local Health XML/ZIP reader. Only workout timing leaves the Mac, and only with --send."""
import argparse
import datetime as dt
import decimal
import getpass
import hashlib
import ipaddress
import json
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from zoneinfo import ZoneInfo


def timestamp(value):
    parsed = dt.datetime.strptime(value, "%Y-%m-%d %H:%M:%S %z")
    return parsed.astimezone(dt.timezone.utc)


def workout(attrs):
    start, end = timestamp(attrs["startDate"]), timestamp(attrs["endDate"])
    unit = attrs.get("durationUnit", "")
    factor = {"s": 1, "sec": 1, "min": 60, "h": 3600}.get(unit)
    if factor is None:
        raise ValueError("Unbekannte Einheit der Trainingsdauer: " + unit)
    value = decimal.Decimal(attrs["duration"])
    seconds = float(value * factor)
    if not value.is_finite() or not 1 <= seconds <= 14400 or seconds > (end - start).total_seconds() + 1:
        raise ValueError("Ungültige aktive Trainingsdauer. Keine Werte werden erfunden oder korrigiert.")
    if end > dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5):
        raise ValueError("Training liegt in der Zukunft.")
    source = attrs.get("sourceName", "Unbekannt")
    activity = attrs.get("workoutActivityType", "Unbekannt")
    if len(source) > 120 or len(activity) > 100:
        raise ValueError("Quellenname oder Trainingsart ist zu lang.")
    start_text = start.isoformat().replace("+00:00", "Z")
    end_text = end.isoformat().replace("+00:00", "Z")
    fingerprint = json.dumps([start_text, end_text, seconds, source, activity], ensure_ascii=False, separators=(",", ":"))
    return {"externalId": hashlib.sha256(fingerprint.encode()).hexdigest(), "startedAt": start_text,
            "endedAt": end_text, "durationSeconds": seconds, "sourceName": source, "activityType": activity}


class SafeReader:
    """Stream input without extracting ZIP files or allowing custom XML entities."""
    def __init__(self, stream):
        self.stream, self.tail, self.total = stream, b"", 0

    def read(self, size=-1):
        data = self.stream.read(min(size if size > 0 else 65536, 65536))
        self.total += len(data)
        if self.total > 4 * 1024 ** 3:
            raise ValueError("Export ist größer als 4 GiB. Bitte einen kleineren Export verwenden.")
        combined = self.tail + data
        if b"<!ENTITY" in combined:
            raise ValueError("XML mit benutzerdefinierten Entities wird nicht verarbeitet.")
        self.tail = combined[-16:]
        return data


def read_workouts(stream, day, zone):
    root, depth, records, seen = None, 0, [], set()
    for event, element in ET.iterparse(SafeReader(stream), events=("start", "end")):
        if event == "start":
            depth += 1
            if root is None:
                root = element
                if root.tag != "HealthData":
                    raise ValueError("Kein Apple-Health-Export: HealthData fehlt.")
            continue
        if element.tag == "Workout" and timestamp(element.attrib["startDate"]).astimezone(zone).date() == day:
            record = workout(element.attrib)
            if record["externalId"] not in seen:
                records.append(record)
                seen.add(record["externalId"])
        element.clear()
        if depth == 2:
            root.clear()
        depth -= 1
    return sorted(records, key=lambda item: item["startedAt"], reverse=True)


def load_export(filename, day, zone):
    if zipfile.is_zipfile(filename):
        with zipfile.ZipFile(filename) as archive:
            members = [name for name in archive.namelist() if pathlib.PurePosixPath(name).name.casefold() == "export.xml" and not name.endswith("/")]
            if len(members) != 1:
                raise ValueError("ZIP muss genau eine Export.xml enthalten (Groß-/Kleinschreibung ist egal). Alternativ die entpackte XML-Datei mit --file angeben.")
            with archive.open(members[0]) as stream:
                return read_workouts(stream, day, zone)
    with open(filename, "rb") as stream:
        return read_workouts(stream, day, zone)


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, url):
        return None


def endpoint(server, allow_http, book=False):
    parsed = urllib.parse.urlsplit(server)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise ValueError("Server als reine Basisadresse angeben, ohne Zugangsdaten oder Pfad.")
    if parsed.scheme == "http":
        try:
            address = ipaddress.ip_address(parsed.hostname)
            local = address.is_private or address.is_loopback
        except ValueError:
            local = parsed.hostname == "localhost"
        if not allow_http or not local:
            raise ValueError("HTTP nur für lokale Server mit --allow-http. Dabei sind Schlüssel und Trainingszeiten im Netzwerk unverschlüsselt; HTTPS ist vorzuziehen.")
    return server.rstrip("/") + ("/api/sync/health-training" if book else "/api/sync/health-training-test")


def training_type(activity, explicit=None):
    if explicit:
        return explicit
    name = activity.removeprefix("HKWorkoutActivityType")
    if name in {"TraditionalStrengthTraining", "FunctionalStrengthTraining"}:
        return "strength"
    if name in {"Cycling", "Running", "Walking", "Swimming", "Rowing", "Elliptical", "StairClimbing", "Hiking", "HandCycling"}:
        return "endurance"
    raise ValueError("Trainingsart nicht eindeutig: " + activity + ". Bitte ausdrücklich --type strength oder --type endurance angeben.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", required=True, help="Health export.zip oder export.xml; bleibt auf diesem Mac")
    parser.add_argument("--profile", required=True, help="FitFamily Profil-ID, z.B. papa")
    parser.add_argument("--server", default="http://192.168.1.253:3000")
    parser.add_argument("--date", help="Lokaler Trainingstag YYYY-MM-DD, standardmäßig heute")
    parser.add_argument("--time-zone", default="Europe/Berlin")
    parser.add_argument("--limit", type=int, default=3, help="Neueste Trainings dieses Tages, maximal 25")
    parser.add_argument("--send", action="store_true", help="Explizit nur diese Trainingszeiten übertragen")
    parser.add_argument("--book", action="store_true", help="Echte Wertung statt Testempfang; Netzwerk weiterhin nur mit --send")
    parser.add_argument("--type", choices=("strength", "endurance"), help="Explizite Zuordnung für unbekannte/gemischte Trainingsarten")
    parser.add_argument("--allow-http", action="store_true")
    options = parser.parse_args(argv)
    if not 1 <= options.limit <= 25 or not re.fullmatch(r"[\w-]{1,80}", options.profile):
        raise ValueError("Limit muss 1 bis 25 sein; Profil-ID darf nur Buchstaben, Ziffern, _ und - enthalten.")
    zone = ZoneInfo(options.time_zone)
    day = dt.date.fromisoformat(options.date) if options.date else dt.datetime.now(zone).date()
    records = load_export(options.file, day, zone)[:options.limit]
    if not records:
        print("Keine aufgezeichneten Trainings an diesem Tag. Nichts gesendet. Trainingsring-Minuten sind keine Workout-Datensätze.")
        return 0
    if options.book:
        for record in records:
            record["trainingType"] = training_type(record["activityType"], options.type)
    body = {"profileId": options.profile, "workouts": records}
    print(json.dumps(body, indent=2, ensure_ascii=False, allow_nan=False))
    for record in records:
        minutes = record["durationSeconds"] / 60
        print(f'{record["sourceName"]}: {minutes:.2f} aktive Minuten = {minutes * 1.5:.2f} ' + ("Punkte (Buchungsvorschau)" if options.book else "Testpunkte"))
    for index, first in enumerate(records):
        for second in records[index + 1:]:
            if first["startedAt"] < second["endedAt"] and second["startedAt"] < first["endedAt"]:
                print("WARNUNG: Trainingszeiträume überlappen. Der Server blockiert zusätzliche Buchungen für überlappende Trainings.")
    if not options.send:
        print("Nur lokale Vorschau. Kein Netzwerkzugriff. Zum Testempfang denselben Befehl mit --send ausführen.")
        return 0
    url = endpoint(options.server, options.allow_http, options.book)
    if options.allow_http and url.startswith("http:"):
        print("ACHTUNG: Übertragung im lokalen Netzwerk ist unverschlüsselt.")
    secret = getpass.getpass("Gemeinsamen Familienschlüssel einfügen (Eingabe unsichtbar): ").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", secret):
        raise ValueError("Familienschlüssel hat ein ungültiges Format.")
    request = urllib.request.Request(url, data=json.dumps(body, allow_nan=False).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + secret}, method="POST")
    opener = urllib.request.build_opener(NoRedirects())
    try:
        with opener.open(request, timeout=30) as response:
            result = response.read(65536).decode()
    except urllib.error.HTTPError as error:
        result = error.read(65536).decode(errors="replace")
        raise ValueError(f"Server meldet HTTP {error.code}: {result}") from None
    print(("Serverantwort (echte Wertung, Konflikte prüfen):\n" if options.book else "Serverantwort (keine Buchung auf dem Dashboard):\n") + result)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, KeyError, OSError, ET.ParseError, decimal.InvalidOperation, zipfile.BadZipFile) as error:
        print("Test abgebrochen: " + str(error), file=sys.stderr)
        sys.exit(1)
