import type { Metadata, Viewport } from "next";
import { Overpass, Public_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { DemoBanner } from "@/components/site/demo-banner";
import "./globals.css";

// Overpass descends from road-sign lettering, which suits the subject; Public Sans is a plain civic text face.
const display = Overpass({ subsets: ["latin"], variable: "--font-civitas-display", display: "swap", weight: ["600", "700", "800"] });
const text = Public_Sans({ subsets: ["latin"], variable: "--font-civitas-text", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Civitas | Incident management for municipal infrastructure", template: "%s | Civitas" },
  description:
    "Civitas takes infrastructure reports from residents, finds the duplicates, ranks what is urgent and matches each job to the right crew, with a coordinator approving every step.",
};

export const viewport: Viewport = { themeColor: "#082d52", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable}`}>
      <body className="min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-navy-900 focus:shadow-lg"
        >
          Skip to main content
        </a>
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
