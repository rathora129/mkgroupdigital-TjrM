import WorkIndexView from '@/components/pages/WorkIndexView';
import { JsonLd, breadcrumbSchema } from '@/lib/schema';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Work',
  description:
    'Selected websites and platforms by MK Group Digital across e-commerce, education, interiors, printing and technology.',
  path: '/work',
});

export default function WorkPage() {
  return (
    <>
      <WorkIndexView />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Work', path: '/work' },
        ])}
      />
    </>
  );
}
