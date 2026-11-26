import AboutView from '@/components/pages/AboutView';
import { JsonLd, breadcrumbSchema } from '@/lib/schema';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'About',
  description:
    'MK Group Digital is a full-service digital agency in India working with businesses worldwide across strategy, design, engineering and growth.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <>
      <AboutView />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'About', path: '/about' },
        ])}
      />
    </>
  );
}
