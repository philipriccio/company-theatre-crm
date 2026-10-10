import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Company Theatre CRM",
  description: "Email management for The Company Theatre",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
