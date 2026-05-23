import type { Metadata } from "next";
import "./globals.css";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const basePath = process.env.GITHUB_ACTIONS === "true" && repositoryName ? `/${repositoryName}` : "";

export const metadata: Metadata = {
  title: "ChatNoir Web",
  description: "A TRPG Mystery Game Interface",
  icons: {
    icon: `${basePath}/favicon.ico`,
    shortcut: `${basePath}/favicon.ico`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
