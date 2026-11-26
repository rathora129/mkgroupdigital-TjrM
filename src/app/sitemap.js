import siteConfig from '@/data/site';
import { services } from '@/data/services';
import { projects } from '@/data/projects';

export default function sitemap() {
  const lastModified = new Date();

  const staticRoutes = [
    { path: '/', priority: 1, changeFrequency: 'monthly' },
    { path: '/services', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/industries', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/work', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/about', priority: 0.7, changeFrequency: 'yearly' },
    { path: '/contact', priority: 0.8, changeFrequency: 'yearly' },
    { path: '/privacy-policy', priority: 0.2, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.2, changeFrequency: 'yearly' },
  ];

  return [
    ...staticRoutes.map((route) => ({
      url: `${siteConfig.url}${route.path}`,
      lastModified,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    ...services.map((service) => ({
      url: `${siteConfig.url}/services/${service.slug}`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    })),
    ...projects.map((project) => ({
      url: `${siteConfig.url}/work/${project.slug}`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.6,
    })),
  ];
}
