import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import PushPrompt from "@/components/PushPrompt";

export const metadata: Metadata = {
  title: "Raven FC",
  description: "Raven FC 일정·스쿼드·기록 관리",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Raven FC",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e3a8a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        <Nav />
        <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 md:pb-10">
          {children}
        </main>
        <PushPrompt />
      </body>
    </html>
  );
}
