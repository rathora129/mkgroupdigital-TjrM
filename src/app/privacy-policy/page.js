import LegalView from '@/components/pages/LegalView';
import { privacyPolicy } from '@/data/legal';
import { JsonLd, breadcrumbSchema } from '@/lib/schema';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Privacy Policy',
  description:
    'How MK Group Digital collects, uses, shares and protects personal information submitted through this website, email and WhatsApp.',
  path: '/privacy-policy',
});

export default function PrivacyPolicyPage() {
  return (
    <>
      <LegalView document={privacyPolicy} />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Privacy Policy', path: '/privacy-policy' },
        ])}
      />
    </>
  );
}
