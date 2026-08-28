import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.SITE_URL ?? 'http://localhost:3000',
  ),
  title: 'The Digital Nuggy Book',
  description: 'A simple doubles snooker score, break and fluke tracker.',
  openGraph: {
    title: 'The Digital Nuggy Book',
    description: 'Scores · Breaks · Flukes',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'The Digital Nuggy Book' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Digital Nuggy Book',
    description: 'Scores · Breaks · Flukes',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
