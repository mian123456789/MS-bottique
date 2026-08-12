import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

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
      <body>
        {children}
      </body>
    </html>
  );
}
