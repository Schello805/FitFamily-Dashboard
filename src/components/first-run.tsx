import QRCode from "qrcode";
import Image from "next/image";

export async function FirstRun({ setupUrl }: { setupUrl: string }) {
  const qr = await QRCode.toDataURL(setupUrl, { width: 480, margin: 2, color: { dark: "#071316", light: "#ffffff" } });
  return (
    <main className="first-run">
      <section className="first-run-copy">
        <div className="first-run-brand"><Image className="first-run-logo" src="/assets/fitfamily-logo.png" alt="" width={300} height={300} priority /><span>FAMILIEN-FITNESS<br /><b>LOKAL &amp; PRIVAT</b></span></div>
        <div className="setup-badge">Willkommen</div>
        <h1>Euer Sportraum.<br /><span>Euer Dashboard.</span></h1>
        <p>Scanne den QR-Code mit einem Handy im selben WLAN. Dort legst du Eltern-PIN und Profildaten sicher fest – ganz ohne Tastatur am Monitor.</p>
        <div className="privacy-note"><b>Alles unter einem Dach.</b><span>Deine Familien- und Trainingsdaten bleiben lokal auf diesem FitFamily-Gerät.</span></div>
      </section>
      <section className="qr-panel">
        <div className="qr-heading"><span>STARTKLAR IN EINEM MOMENT</span><h2>Mit dem Handy<br />einrichten</h2><p>Einfach den Code scannen</p></div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR-Code zur Einrichtung am Handy" />
        <div className="qr-caption"><strong>Einmal scannen, dann loslegen.</strong><span>Der Einrichtungsassistent öffnet sich direkt im Browser deines Handys.</span></div>
        <code><i /> {setupUrl}</code>
      </section>
    </main>
  );
}
