import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nookplay — A little room for big secrets",
  description: "Gather your friends for a game of hidden roles, mystery, and deduction."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
