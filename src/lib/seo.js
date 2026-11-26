import siteConfig from '@/data/site';

export function buildMetadata({
  title,
  description,
  path,
  image = '/brand/og-image.png',
  imageWidth = 1200,
  imageHeight = 630,
  imageAlt = 'MK Group Digital — digital agency for ambitious brands',
  type = 'website',
  noIndex = false,
}) {
  const fullTitle = `${title} | ${siteConfig.name}`;
  const url = `${siteConfig.url}${path}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      type,
      locale: 'en',
      url,
      siteName: siteConfig.name,
      title: fullTitle,
      description,
      images: [{ url: image, width: imageWidth, height: imageHeight, alt: imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [image],
    },
  };
}
