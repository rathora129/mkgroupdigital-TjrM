import ContactView from '@/components/pages/ContactView';
import siteConfig from '@/data/site';
import { JsonLd, breadcrumbSchema } from '@/lib/schema';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Contact',
  description:
    'Start a project with MK Group Digital. Tell us what you are building, or reach us by email or WhatsApp. We reply within one business day.',
  path: '/contact',
});

const contactPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  name: `Contact ${siteConfig.name}`,
  url: `${siteConfig.url}/contact`,
  mainEntity: {
    '@type': 'Organization',
    name: siteConfig.name,
    url: siteConfig.url,
    email: siteConfig.email,
    telephone: siteConfig.phone,
  },
};

export default function ContactPage() {
  return (
    <>
      <ContactView />
      <JsonLd data={contactPageSchema} />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Contact', path: '/contact' },
        ])}
      />
    </>
  );
}
