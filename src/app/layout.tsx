import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

export const metadata: Metadata = {
  title: "NED AMS — Asset Management System",
  description: "NED University of Engineering & Technology — Asset Management System",
  icons: { icon: "/ned_seal.webp" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:ital,wght@0,400..600;1,400..500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
