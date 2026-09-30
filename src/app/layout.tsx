import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";
import { PersistentMusicPlayer } from "@/components/persistent-music-player";

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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('fitfamily-theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`
          }}
        />
      </head>
      <body><ServiceWorker /><PersistentMusicPlayer />{children}</body>
    </html>
  );
}
