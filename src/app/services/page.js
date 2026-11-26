import ServicesIndexView from '@/components/pages/ServicesIndexView';
import { JsonLd, breadcrumbSchema } from '@/lib/schema';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Digital Services',
  description:
    'Website development, UI/UX design, SEO, digital marketing, social media, branding, e-commerce and custom web applications for ambitious businesses.',
  path: '/services',
});

export default function ServicesPage() {
  return (
    <>
      <ServicesIndexView />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Services', path: '/services' },
        ])}
      />
    </>
  );
}
