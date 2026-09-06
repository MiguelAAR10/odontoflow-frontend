import type { Metadata, Viewport } from "next";
import "../src/index.css";

export const metadata: Metadata = {
  title: "Odonto Smart",
  description: "Gestión clínica integral para Odonto Smart",
};

export const viewport: Viewport = { themeColor: "#0A0F1A" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
