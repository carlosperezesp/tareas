import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "La Lista",
  description: "Tareas, notas y compra sincronizadas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
