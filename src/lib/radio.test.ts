import { describe, expect, it } from "vitest";
import { RADIO_STATIONS, SPORTS_RADIO_PAGE } from "@/lib/radio";

describe("Radio-Player", () => {
  it("enthält sechs sichere HTTPS-Livestreams mit den gewünschten Sendern", () => {
    expect(RADIO_STATIONS).toHaveLength(6);
    expect(RADIO_STATIONS.map((station) => station.name)).toEqual([
      "1LIVE", "1LIVE DIGGI", "ANTENNE BAYERN", "ROCK ANTENNE", "BAYERN 3", "BR24"
    ]);
    expect(RADIO_STATIONS.every((station) => station.streamUrl.startsWith("https://"))).toBe(true);
  });

  it("verweist für Sport-Audioreportagen auf die Sportschau", () => {
    expect(SPORTS_RADIO_PAGE).toBe("https://www.sportschau.de/fussball/bundesliga-und-2-bundesliga-live-bei-der-sportschau,how-to-audio-netcast-100.html");
  });
});
