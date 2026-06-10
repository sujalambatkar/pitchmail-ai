import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PitchMail AI — Win US clients from your inbox",
  description:
    "Cold email engine for Indian freelancers and agencies pitching US clients. Personalized emails, bulk CSV generation, reply analysis, and A/B subject lines — in seconds.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased bg-[#fafafa] text-zinc-900">
        {children}
      </body>
    </html>
  );
}
