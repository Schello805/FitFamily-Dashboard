import Link from "next/link";

export default function ExpiredLinkPage() {
  return <main className="message-page"><div><span>QR-Link abgelaufen</span><h1>Bitte neu scannen</h1><p>Der sichere Übergabelink ist nur zehn Minuten und genau einmal gültig.</p><Link href="/">Zum Dashboard</Link></div></main>;
}
