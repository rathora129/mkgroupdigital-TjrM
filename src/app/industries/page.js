import IndustriesView from '@/components/pages/IndustriesView';
import { JsonLd, breadcrumbSchema } from '@/lib/schema';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Industries We Serve',
  description:
    'Websites, software and digital growth for retail, education, healthcare, real estate, hospitality, manufacturing, e-commerce, professional services, startups and enterprises.',
  path: '/industries',
});

export default function IndustriesPage() {
  return (
    <>
      <IndustriesView />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Industries', path: '/industries' },
        ])}
      />
    </>
  );
}
