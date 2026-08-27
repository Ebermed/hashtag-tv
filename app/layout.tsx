import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hashtag TV | De toda, a todas horas",
  description: "Televisión musical por internet con canales continuos, programas y transmisiones en vivo.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
