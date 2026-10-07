import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "M&A Deal Browser",
  description: "Paste M&A news and get the deal details extracted",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
