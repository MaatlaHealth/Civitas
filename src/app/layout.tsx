import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { EvaluationBanner } from "@/components/site/evaluation-banner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Civitas | Infrastructure incident intelligence", template: "%s | Civitas" },
  description:
    "Civitas turns community infrastructure reports into actionable intelligence, helping engineering teams identify problems, prioritise responses and coordinate repairs.",
};

export const viewport: Viewport = { themeColor: "#082d52", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-navy-900 focus:shadow-lg"
        >
          Skip to main content
        </a>
        <EvaluationBanner />
        {children}
      </body>
    </html>
  );
}
