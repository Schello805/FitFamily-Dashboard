export function ConnectionStatus({ connectionError, lastRefreshedAt, className = "" }: {
  connectionError: boolean;
  lastRefreshedAt: number | null;
  className?: string;
}) {
  const connected = !connectionError && lastRefreshedAt !== null;
  return <span className={`connection-status ${connected ? "is-connected" : connectionError ? "is-offline" : "is-checking"} ${className}`.trim()} role="status">
    <i aria-hidden="true" />
    <span>{connectionError ? "Verbindung unterbrochen" : connected ? "Lokal verbunden" : "Verbindung wird geprüft"}
      {lastRefreshedAt !== null && <small>Letzte Aktualisierung: {new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(lastRefreshedAt)}</small>}
      {connectionError && <small>Die angezeigten Daten können veraltet sein. Verbindung wird erneut geprüft.</small>}
    </span>
  </span>;
}
