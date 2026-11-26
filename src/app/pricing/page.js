import PricingView from '@/components/pages/PricingView';
import { JsonLd, breadcrumbSchema } from '@/lib/schema';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Pricing',
  description:
    'Transparent starting prices for website development, custom business software and digital marketing in India. Indicative prices — every project is confirmed with a written quote.',
  path: '/pricing',
});

export default function PricingPage() {
  return (
    <>
      <PricingView />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Pricing', path: '/pricing' },
        ])}
      />
    </>
  );
}
