export type RadioStation = {
  id: string;
  name: string;
  description: string;
  streamUrl: string;
  sourceUrl: string;
};

export const RADIO_STATIONS: RadioStation[] = [
  {
    id: "1live",
    name: "1LIVE",
    description: "Musik & Pop · WDR",
    streamUrl: "https://wdr-1live-live.icecastssl.wdr.de/wdr/1live/live/mp3/128/stream.mp3",
    sourceUrl: "https://www1.wdr.de/radio/player/streams/audiostream-live-100.html"
  },
  {
    id: "1live-diggi",
    name: "1LIVE DIGGI",
    description: "Musik ohne Moderation · WDR",
    streamUrl: "https://wdr-1live-diggi.icecastssl.wdr.de/wdr/1live/diggi/mp3/128/stream.mp3",
    sourceUrl: "https://www1.wdr.de/unternehmen/der-wdr/empfang-technik/webradio-100.amp"
  },
  {
    id: "antenne-bayern",
    name: "ANTENNE BAYERN",
    description: "Bayerns bester Musikmix",
    streamUrl: "https://stream.antenne.de/antenne/stream/mp3",
    sourceUrl: "https://www.antenne.de/programm/empfang/webradio"
  },
  {
    id: "rock-antenne",
    name: "ROCK ANTENNE",
    description: "Rock nonstop",
    streamUrl: "https://stream.rockantenne.de/rockantenne/stream/mp3",
    sourceUrl: "https://www.rockantenne.de/rockhoeren/empfang/streamlinks"
  },
  {
    id: "bayern-3",
    name: "BAYERN 3",
    description: "Pop & aktuelle Hits · BR",
    streamUrl: "https://dispatcher.rndfnk.com/br/br3/live/mp3/mid",
    sourceUrl: "https://www.br.de/service/urls-livestreams-100~attachment.pdf"
  },
  {
    id: "br24",
    name: "BR24",
    description: "Nachrichten & Sport · BR",
    streamUrl: "https://dispatcher.rndfnk.com/br/br24/live/mp3/mid",
    sourceUrl: "https://www.br.de/service/urls-livestreams-100~attachment.pdf"
  }
];

export const SPORTS_RADIO_PAGE = "https://www.sportschau.de/fussball/bundesliga-und-2-bundesliga-live-bei-der-sportschau,how-to-audio-netcast-100.html";

export function getRadioStation(stationId: string) {
  return RADIO_STATIONS.find((station) => station.id === stationId);
}
