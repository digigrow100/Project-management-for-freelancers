import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Freelance HQ — Project Management",
  description: "Track SEO, web development and digital marketing projects in one place.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Freelance HQ",
  },
};

export const viewport: Viewport = {
  themeColor: "#030a07",
  // Without this, env(safe-area-inset-*) evaluates to 0 on iOS Safari — the
  // mobile bottom nav's safe-area padding (and the ticker/AI-launcher
  // clearance built on top of it) silently does nothing without it.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-base-950 font-sans text-neutral-200 antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
