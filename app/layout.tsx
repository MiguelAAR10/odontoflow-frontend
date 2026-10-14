import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "../src/index.css";

const readex = localFont({ src: "../public/fonts/readexpro.woff2", variable: "--font-readex", weight: "160 700", display: "swap" });
const outfit = localFont({ src: "../public/fonts/outfit.woff2", variable: "--font-outfit", weight: "100 900", display: "swap" });
const pixelify = localFont({ src: "../public/fonts/pixelifysans.woff2", variable: "--font-pixelify", weight: "400 700", display: "swap" });

export const metadata: Metadata = {
  title: "Odonto Smart",
  description: "Gestión clínica integral para Odonto Smart",
};

export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F6F6F3" }, { media: "(prefers-color-scheme: dark)", color: "#0E0F12" }] };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${readex.variable} ${outfit.variable} ${pixelify.variable}`}>
      <body>{children}</body>
    </html>
  );
}
