import type { Metadata, Viewport } from "next";
import { Figtree, Fraunces } from "next/font/google";
import { Suspense } from "react";

import { ServiceWorkerRegister } from "@/components/service-worker";
import { ShellSwitch } from "@/components/shell-switch";
import { Toaster } from "@/components/ui/sonner";
import { APP_NAME } from "@/lib/constants";

import "./globals.css";

const sans = Figtree({
  subsets: ["latin"],
  variable: "--font-sans",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: "Bill due dates, credit cards, and household expenses.",
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/brand/billboard-logo.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#7B2FE0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <Suspense fallback={<div className="min-h-dvh bg-background" />}>
          <ShellSwitch>{children}</ShellSwitch>
        </Suspense>
        <Toaster position="top-center" />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
