import type { Metadata } from "next";
import "./globals.css";
import { Inter, Playfair_Display } from "next/font/google";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://heis.studio'),
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/favicon.ico', sizes: 'any' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
  openGraph: { images: [{ url: '/brand/heis-social.png', width: 1200, height: 630, alt: 'Heis creative workspace' }] },
  twitter: { card: 'summary_large_image', images: ['/brand/heis-social.png'] },
  title: "Heis | Your desktop studio for AI video",
  description: "Explore video, image, and audio creation in one focused desktop workspace. Heis for Apple silicon Macs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${inter.variable} ${playfair.variable}`}>{children}</body></html>;
}
