import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Election Path 2026",
  description: "A historical-path model for the 2026 House generic ballot.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
