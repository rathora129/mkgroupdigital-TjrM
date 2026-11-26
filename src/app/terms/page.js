import LegalView from '@/components/pages/LegalView';
import { termsAndConditions } from '@/data/legal';
import { JsonLd, breadcrumbSchema } from '@/lib/schema';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Terms & Conditions',
  description:
    'The terms that apply to your use of the MK Group Digital website, its content, enquiries and external links.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <>
      <LegalView document={termsAndConditions} />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Terms & Conditions', path: '/terms' },
        ])}
      />
    </>
  );
}
