import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nookplay — Mafia: Suspect Everyone",
  description: "A host-led Mafia game with private roles, live rooms, and face-to-face deduction."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
