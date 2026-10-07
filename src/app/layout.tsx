import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

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
        <div className="flex flex-col md:flex-row h-dvh bg-stone-100/50">
          <Sidebar />
          <main
            id="main-content"
            className="flex-1 min-w-0 min-h-0 overflow-auto"
          >
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
