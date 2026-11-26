'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowUpRight,
  ExternalLink,
  Globe2,
  Layers,
} from 'lucide-react';
import styled from 'styled-components';
import PageHero from '@/components/sections/PageHero';
import Section from '@/components/ui/Section';
import Container from '@/components/ui/Container';
import SectionHeading from '@/components/ui/SectionHeading';
import ProjectCard from '@/components/ui/ProjectCard';
import Reveal from '@/components/ui/Reveal';
import Button from '@/components/ui/Button';
import CtaSection from '@/components/sections/CtaSection';
import { projects } from '@/data/projects';
import services from '@/data/services';
import { media } from '@/styles/theme';

const Cover = styled.figure`
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: ${({ theme }) => theme.radius.xl};
  border: 1px solid ${({ theme }) => theme.colors.lineStrong};
  background: ${({ theme }) => theme.colors.bgRaised};
  box-shadow: ${({ theme }) => theme.shadow.card};

  img {
    object-fit: cover;
    object-position: ${({ $position }) => $position || 'top center'};
  }

  ${media.down('md')} {
    aspect-ratio: 4 / 3;
    border-radius: ${({ theme }) => theme.radius.lg};
  }
`;

const Overview = styled.div`
  display: grid;
  grid-template-columns: 1.35fr 0.65fr;
  gap: clamp(2rem, 6vw, 5rem);
  align-items: start;

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const Copy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;

  p {
    font-size: clamp(0.98rem, 1.5vw, 1.08rem);
    line-height: 1.8;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const Aside = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.colors.card};
`;

const MetaGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const MetaLabel = styled.h3`
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.17em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.faint};
`;

const MetaValue = styled.p`
  font-size: 0.92rem;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.textSoft};
`;

const ServiceLinks = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;

  a {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.32rem 0.6rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.line};
    font-size: 0.72rem;
    color: ${({ theme }) => theme.colors.textSoft};
    transition:
      border-color 0.3s ease,
      color 0.3s ease,
      background 0.3s ease;
  }

  a:hover {
    border-color: ${({ theme }) => theme.colors.violetLine};
    background: ${({ theme }) => theme.colors.violetWash};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Divider = styled.hr`
  width: 100%;
  height: 1px;
  border: 0;
  background: ${({ theme }) => theme.colors.lineSoft};
`;

const External = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.86rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.violetSoft};

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Highlights = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-top: clamp(2.5rem, 5vw, 3.5rem);

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const Highlight = styled.article`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.5rem;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: rgba(255, 255, 255, 0.02);

  svg {
    color: ${({ theme }) => theme.colors.violetSoft};
  }

  p {
    font-size: 0.92rem;
    line-height: 1.65;
    color: ${({ theme }) => theme.colors.textSoft};
  }
`;

const Note = styled.p`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1.25rem;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.violetSoft};

  svg {
    flex-shrink: 0;
  }
`;

const MoreGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-top: clamp(2.5rem, 5vw, 3.5rem);

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const AllWork = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: ${({ theme }) => theme.colors.violetSoft};
  font-size: 0.85rem;
  font-weight: 600;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

export default function WorkDetailView({ project }) {
  const projectServiceLinks = project.services
    .map((title) => ({
      title,
      slug: services.find((service) => service.title === title)?.slug,
    }))
    .filter((item) => item.slug);

  const more = projects
    .filter((item) => item.slug !== project.slug)
    .slice(0, 3);

  return (
    <>
      <PageHero
        breadcrumb={[
          { name: 'Home', path: '/' },
          { name: 'Work', path: '/work' },
          { name: project.name },
        ]}
        eyebrow={`${project.industry} · ${project.status}`}
        title={
          <>
            {project.name}
            <em>.</em>
          </>
        }
        description={project.summary}
        actions={
          project.url ? (
            <>
              <Button
                href={project.url}
                external
                size="lg"
                icon={<ExternalLink size={16} strokeWidth={1.9} />}
                arrow={false}
              >
                Visit live site
              </Button>
              <Button href="/contact" variant="secondary" size="lg">
                Start a similar project
              </Button>
            </>
          ) : (
            <>
              <Button href="/contact" size="lg">
                Request a preview
              </Button>
              <Button href="/contact" variant="secondary" size="lg">
                Start a similar project
              </Button>
            </>
          )
        }
      />

      <Section $compact>
        <Container $width="wide">
          <Reveal y={18}>
            <Cover
              $position={project.slug === 'rooteco' ? 'center' : 'top center'}
            >
              <Image
                src={project.image}
                alt={project.imageAlt}
                fill
                priority
                sizes="(max-width: 900px) 100vw, 1420px"
              />
            </Cover>
          </Reveal>
        </Container>
      </Section>

      <Section $compact aria-labelledby="overview-heading">
        <Container>
          <Overview>
            <div>
              <SectionHeading
                eyebrow="The project"
                title={
                  <>
                    What we <em>set out to do.</em>
                  </>
                }
                headingId="overview-heading"
              />
              <Copy style={{ marginTop: '1.5rem' }}>
                {project.overview.map((paragraph) => (
                  <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                ))}
                {project.note ? (
                  <Note>
                    <Globe2 size={15} /> {project.note}
                  </Note>
                ) : null}
              </Copy>
            </div>

            <Aside aria-label="Project details">
              <MetaGroup>
                <MetaLabel>Industry</MetaLabel>
                <MetaValue>{project.industry}</MetaValue>
              </MetaGroup>
              <Divider />
              <MetaGroup>
                <MetaLabel>Services</MetaLabel>
                <ServiceLinks>
                  {projectServiceLinks.map((item) => (
                    <Link key={item.title} href={`/services/${item.slug}`}>
                      {item.title} <ArrowUpRight size={11} />
                    </Link>
                  ))}
                </ServiceLinks>
              </MetaGroup>
              <Divider />
              <MetaGroup>
                <MetaLabel>Status</MetaLabel>
                <MetaValue>{project.status}</MetaValue>
              </MetaGroup>
              <Divider />
              <MetaGroup>
                <MetaLabel>Link</MetaLabel>
                {project.url ? (
                  <External
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {new URL(project.url).hostname.replace('www.', '')}
                    <ExternalLink size={13} />
                  </External>
                ) : (
                  <MetaValue>{project.note || 'Private build'}</MetaValue>
                )}
              </MetaGroup>
            </Aside>
          </Overview>

          <Highlights>
            {project.highlights.map((highlight, index) => (
              <Reveal key={highlight} delay={index * 0.07} y={18}>
                <Highlight>
                  <Layers size={18} />
                  <p>{highlight}</p>
                </Highlight>
              </Reveal>
            ))}
          </Highlights>
        </Container>
      </Section>

      <Section $tone="soft" aria-labelledby="more-work-heading">
        <Container $width="wide">
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: '1.5rem',
              flexWrap: 'wrap',
            }}
          >
            <SectionHeading
              eyebrow="More work"
              title={
                <>
                  Keep <em>looking.</em>
                </>
              }
              headingId="more-work-heading"
            />
            <AllWork href="/work">
              All projects <ArrowUpRight size={14} />
            </AllWork>
          </div>
          <MoreGrid>
            {more.map((item, index) => (
              <Reveal key={item.slug} delay={index * 0.07} y={20}>
                <ProjectCard project={item} />
              </Reveal>
            ))}
          </MoreGrid>
        </Container>
      </Section>

      <CtaSection
        eyebrow="Your project next"
        description={`Have a project in ${project.industry.toLowerCase()} — or something else entirely? Tell us what you are building and we will take it from there.`}
      />
    </>
  );
}
