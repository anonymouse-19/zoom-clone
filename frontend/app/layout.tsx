/**
 * Root layout: the HTML shell (<html>, <body>, font, providers) around every page.
 *
 * Rendered by: Next.js for every route. Pages with the top navbar get an extra nested
 * layout in app/(main)/layout.tsx. The meeting room doesn't use it, which is why the
 * navbar does not live here.
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

// Zoom's brand font is proprietary, so we use Inter (see docs/DECISIONS.md).
// next/font downloads it at build time and serves it from our own domain, so the browser
// never calls Google and the text doesn't jump when the font loads.
// `variable` exposes the font as a CSS variable that globals.css hands to Tailwind.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Zoom Clone",
  description: "A Zoom-style video conferencing web app.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
