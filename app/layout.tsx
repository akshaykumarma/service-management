import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Service Management",
  description: "Multi-store machine-servicing ticket platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
