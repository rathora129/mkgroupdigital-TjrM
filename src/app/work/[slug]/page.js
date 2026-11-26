import { notFound } from 'next/navigation';
import WorkDetailView from '@/components/pages/WorkDetailView';
import { projects, getProjectBySlug } from '@/data/projects';
import { JsonLd, breadcrumbSchema } from '@/lib/schema';
import { buildMetadata } from '@/lib/seo';

export const dynamicParams = false;

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  if (!project) {
    return { title: 'Project not found' };
  }

  const image = project.imageWide || project.image;
  const isWide = Boolean(project.imageWide);

  return buildMetadata({
    title: `${project.name} — ${project.industry}`,
    description: project.summary,
    path: `/work/${project.slug}`,
    image,
    imageWidth: isWide ? 1680 : 1200,
    imageHeight: isWide ? 720 : 900,
    imageAlt: project.imageAlt,
    type: 'article',
  });
}

export default async function ProjectPage({ params }) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);

  if (!project) notFound();

  return (
    <>
      <WorkDetailView project={project} />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Work', path: '/work' },
          { name: project.name, path: `/work/${project.slug}` },
        ])}
      />
    </>
  );
}
