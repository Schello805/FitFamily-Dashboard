import QRCode from "qrcode";

export async function FirstRun({ setupUrl }: { setupUrl: string }) {
  const qr = await QRCode.toDataURL(setupUrl, { width: 480, margin: 2, color: { dark: "#071316", light: "#ffffff" } });
  return (
    <main className="first-run">
      <section>
        <div className="setup-badge">Willkommen</div>
        <h1>FitFamily<br /><span>einrichten.</span></h1>
        <p>Scanne den QR-Code mit einem Handy im selben WLAN. Dort legst du Eltern-PIN und Profildaten sicher fest – ganz ohne Tastatur am Monitor.</p>
        <div className="privacy-note"><b>Alles unter einem Dach.</b><span>Deine Familien- und Trainingsdaten bleiben lokal auf diesem FitFamily-Gerät.</span></div>
      </section>
      <section className="qr-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR-Code zur Einrichtung am Handy" />
        <strong>Mit dem Handy scannen</strong>
        <span>Der Einrichtungsassistent öffnet sich im Browser.</span>
        <code>{setupUrl}</code>
      </section>
    </main>
  );
}
