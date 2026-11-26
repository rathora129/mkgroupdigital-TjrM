import { notFound } from 'next/navigation';
import ServiceDetailView from '@/components/pages/ServiceDetailView';
import { services, getServiceBySlug } from '@/data/services';
import { JsonLd, serviceSchema, breadcrumbSchema } from '@/lib/schema';
import { buildMetadata } from '@/lib/seo';

export const dynamicParams = false;

export function generateStaticParams() {
  return services.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const service = getServiceBySlug(slug);

  if (!service) {
    return { title: 'Service not found' };
  }

  return buildMetadata({
    title: service.seoTitle,
    description: service.seoDescription,
    path: `/services/${service.slug}`,
    imageAlt: `${service.title} by MK Group Digital`,
  });
}

export default async function ServicePage({ params }) {
  const { slug } = await params;
  const service = getServiceBySlug(slug);

  if (!service) notFound();

  return (
    <>
      <ServiceDetailView service={service} />
      <JsonLd data={serviceSchema(service)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Services', path: '/services' },
          { name: service.title, path: `/services/${service.slug}` },
        ])}
      />
    </>
  );
}
