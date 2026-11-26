import { Inter, Space_Grotesk } from 'next/font/google';
import StyledComponentsRegistry from '@/lib/registry';
import Providers from '@/components/layout/Providers';
import SiteFrame from '@/components/layout/SiteFrame';
import siteConfig from '@/data/site';
import { JsonLd, organizationSchema, websiteSchema } from '@/lib/schema';

const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: 'MK Group Digital — Digital Agency for Ambitious Brands',
    template: '%s | MK Group Digital',
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  category: 'Digital agency',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en',
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: 'MK Group Digital — Digital Agency for Ambitious Brands',
    description: siteConfig.description,
    images: [
      {
        url: '/brand/og-image.png',
        width: 1200,
        height: 630,
        alt: 'MK Group Digital — websites, branding, SEO, marketing and automation',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MK Group Digital — Digital Agency for Ambitious Brands',
    description: siteConfig.description,
    images: ['/brand/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [{ url: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' }],
    apple: [{ url: '/brand/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#07070C',
  colorScheme: 'dark',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body id="top">
        <StyledComponentsRegistry>
          <Providers>
            <SiteFrame
              schemas={
                <>
                  <JsonLd data={organizationSchema()} />
                  <JsonLd data={websiteSchema()} />
                </>
              }
            >
              {children}
            </SiteFrame>
          </Providers>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
