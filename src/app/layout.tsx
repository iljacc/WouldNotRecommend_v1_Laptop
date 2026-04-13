import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Would Not Recommend",
  description: "An autonomous Street View installation reading one-star reviews.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
