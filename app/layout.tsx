import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CONFIG } from "@/lib/engine/config";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const APP_URL = CONFIG.appBaseUrl;

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "SendGate - Self-Hosted Email Validation",
  description:
    "Lightweight, stateless utility for email validation and risk assessment. Protect your domain reputation before you hit send.",
  keywords: ["email validation", "email risk analysis", "deliverability", "self-hosted", "email verification"],
  openGraph: {
    title: "SendGate - Self-Hosted Email Validation",
    description:
      "Lightweight, stateless utility for email validation and risk assessment. Clear risk breakdown for your email list.",
    url: "./",
    siteName: "SendGate",
    images: [
      {
        url: "/big-logo.png",
        width: 1200,
        height: 630,
        alt: "SendGate - Email Validation Utility",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SendGate - Self-Hosted Email Validation",
    description:
      "Lightweight, stateless utility for email validation and risk assessment.",
    images: ["/big-logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased min-h-screen flex flex-col">{children}</body>
    </html>
  );
}
