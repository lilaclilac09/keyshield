import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import ClerkHeader from "./ClerkHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "KeyShield (Clerk)",
  description: "KeyShield with Clerk auth (Next.js App Router)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="app-shell">
          <ClerkHeader />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}

