import type { Metadata } from "next";
import { Shippori_Mincho, Noto_Sans_JP, Klee_One } from "next/font/google";
import "./globals.css";

const shippori = Shippori_Mincho({
  weight: ['400', '600'],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif",
});

const notoSans = Noto_Sans_JP({
  weight: ['400', '600'],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const klee = Klee_One({
  weight: ['400', '600'],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-klee",
});

export const metadata: Metadata = {
  title: "ChatNoir Web",
  description: "A TRPG Mystery Game Interface",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${shippori.variable} ${notoSans.variable} ${klee.variable}`}>
      <body>{children}</body>
    </html>
  );
}
