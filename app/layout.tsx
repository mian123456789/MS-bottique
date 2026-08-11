import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

// Inter carries the dense 8-11px table text; Plus Jakarta Sans gives the
// headings and figures their character.
const interSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jakartaDisplay = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return {
    metadataBase: new URL(`${protocol}://${host}`),
    title: "MS Boutique Factory Management System",
    description: "Department-wise lot and production tracking from Issue Lot through Warehouse and Customer Dispatch.",
    openGraph: {
      title: "MS Boutique Factory Management System",
      description: "Lot & Production Tracking System",
      images: [{ url: "/og.png", width: 1664, height: 948, alt: "MS Boutique Factory Management System production workflow" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "MS Boutique Factory Management System",
      description: "Lot & Production Tracking System",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${interSans.variable} ${jakartaDisplay.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
