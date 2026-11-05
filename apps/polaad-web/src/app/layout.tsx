import type { Metadata } from "next";
import { Poppins } from "next/font/google";

import { defaultBrand } from "@/lib/brand";
import { TallyConnectionStatusProvider } from "@/components/tally/TallyConnectionStatusProvider";

import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  display: "swap",
});

const brand = defaultBrand();

export const metadata: Metadata = {
  title: brand.product,
  description: brand.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${poppins.variable} ${poppins.className} antialiased`}>
        <TallyConnectionStatusProvider>
          {children}
        </TallyConnectionStatusProvider>
      </body>
    </html>
  );
}
