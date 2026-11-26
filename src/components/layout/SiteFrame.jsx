'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';

export default function SiteFrame({ children, schemas }) {
  const pathname = usePathname() || '/';
  const isWorkspace =
    pathname === '/workspace' || pathname.startsWith('/workspace/');

  if (isWorkspace) return children;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <WhatsAppFloat />
      <div className="noise" aria-hidden="true" />
      {schemas}
    </>
  );
}
