import { NextResponse } from "next/server";

const endpoint = new URL("https://api.open-meteo.com/v1/forecast");
endpoint.search = new URLSearchParams({
  latitude: "49.153",
  longitude: "10.552",
  current: "temperature_2m,apparent_temperature,weather_code",
  hourly: "temperature_2m,precipitation_probability,weather_code",
  forecast_hours: "8",
  timezone: "Europe/Berlin"
}).toString();

export async function GET() {
  try {
    const response = await fetch(endpoint, { next: { revalidate: 900 } });
    if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
    return NextResponse.json(await response.json(), {
      headers: { "Cache-Control": "public, max-age=900, stale-while-revalidate=3600" }
    });
  } catch {
    return NextResponse.json({ unavailable: true }, { status: 503 });
  }
}
