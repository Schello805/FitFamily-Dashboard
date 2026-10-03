import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";
import { PersistentMusicPlayer } from "@/components/persistent-music-player";
import { ToastContainer } from "@/components/toast";
import { TouchKeyboard } from "@/components/touch-keyboard";
import { getDisplaySettings } from "@/lib/display-settings";
import { automaticTheme } from "@/lib/theme";
import { isWithinNightWindow } from "@/lib/display-time";

export const metadata: Metadata = {
  title: "FitFamily Dashboard",
  description: "Das lokale Familien-Fitnessdashboard",
  applicationName: "FitFamily Dashboard",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ebf2f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f2025" }
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  const settings = await getDisplaySettings();
  return (
    <html lang="de" data-theme={automaticTheme(new Date(), settings)} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var settings=${JSON.stringify(settings)};localStorage.setItem('fitfamily_display_settings',JSON.stringify(settings));var s=localStorage.getItem('fitfamily-theme')||'system';var night=${isWithinNightWindow.toString()};var d=s==='system'?night(new Date(),settings.nightStartTime,settings.nightEndTime,settings.timeZone):s==='dark';document.documentElement.setAttribute('data-theme',d?'dark':'light');document.documentElement.setAttribute('data-theme-setting',s);}catch(e){}})();`
          }}
        />
      </head>
      <body><ServiceWorker /><PersistentMusicPlayer /><ToastContainer />{children}<TouchKeyboard /></body>
    </html>
  );
}
