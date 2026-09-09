import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sidewave — YouTube together",
  description: "A shared YouTube room for watching, queuing, and ordering videos together.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
