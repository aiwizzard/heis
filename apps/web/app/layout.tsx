import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://app.heis.studio'),
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/favicon.ico', sizes: 'any' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
  openGraph: { images: [{ url: '/brand/heis-social.png', width: 1200, height: 630, alt: 'Heis creative workspace' }] },
  twitter: { card: 'summary_large_image', images: ['/brand/heis-social.png'] },
  title: "Heis | AI creative studio for macOS",
  description: "Create images, video, audio, workflows, and agent-assisted edits in one local-first macOS studio.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
