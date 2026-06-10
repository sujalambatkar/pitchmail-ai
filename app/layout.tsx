import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PitchMail AI — Cold emails that actually get replies",
  description:
    "Paste a LinkedIn profile, get a personalized cold email and follow-up in seconds. Built for freelancers and SDRs.",
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
