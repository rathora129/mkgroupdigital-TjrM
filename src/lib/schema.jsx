import siteConfig from '@/data/site';

const organizationId = `${siteConfig.url}/#organization`;
const websiteId = `${siteConfig.url}/#website`;

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': organizationId,
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    email: siteConfig.email,
    telephone: siteConfig.phone,
    logo: {
      '@type': 'ImageObject',
      url: `${siteConfig.url}/brand/mk-mark-light.png`,
      width: 723,
      height: 377,
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email: siteConfig.email,
      telephone: siteConfig.phone,
      areaServed: ['IN', 'Worldwide'],
      availableLanguage: ['English'],
    },
  };
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': websiteId,
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    publisher: { '@id': organizationId },
    inLanguage: 'en',
  };
}

export function serviceSchema(service) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.title,
    serviceType: service.title,
    description: service.seoDescription,
    url: `${siteConfig.url}/services/${service.slug}`,
    provider: {
      '@type': 'Organization',
      '@id': organizationId,
      name: siteConfig.name,
      url: siteConfig.url,
    },
    areaServed: ['India', 'Worldwide'],
  };
}

export function breadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${siteConfig.url}${item.path}`,
    })),
  };
}

export function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
