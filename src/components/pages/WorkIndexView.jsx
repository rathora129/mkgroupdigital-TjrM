'use client';

import styled from 'styled-components';
import { MessageCircle } from 'lucide-react';
import PageHero from '@/components/sections/PageHero';
import Section from '@/components/ui/Section';
import Container from '@/components/ui/Container';
import SectionHeading from '@/components/ui/SectionHeading';
import ProjectCard from '@/components/ui/ProjectCard';
import Reveal from '@/components/ui/Reveal';
import Button from '@/components/ui/Button';
import CtaSection from '@/components/sections/CtaSection';
import projects from '@/data/projects';
import siteConfig from '@/data/site';
import { media } from '@/styles/theme';

const StatsPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  width: 100%;
  padding: 1.5rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background:
    radial-gradient(300px circle at 100% 0%, rgba(124, 92, 255, 0.16), transparent 65%),
    ${({ theme }) => theme.colors.card};
`;

const Stats = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
`;

const Stat = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;

  strong {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 2.3rem;
    font-weight: 600;
    line-height: 1;
    letter-spacing: -0.05em;
  }

  span {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.faint};
  }
`;

const StatsNote = styled.p`
  padding-top: 0.9rem;
  border-top: 1px solid ${({ theme }) => theme.colors.lineSoft};
  font-size: 0.76rem;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.muted};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.1rem;

  .wide-card {
    grid-column: span 2;
  }

  ${media.down('md')} {
    grid-template-columns: 1fr;

    .wide-card {
      grid-column: auto;
    }
  }
`;

export default function WorkIndexView() {
  const industries = new Set(projects.map((project) => project.industry)).size;

  return (
    <>
      <PageHero
        breadcrumb={[{ name: 'Home', path: '/' }, { name: 'Work' }]}
        eyebrow="Selected Work"
        title={
          <>
            Real projects.
            <br />
            Live <em>experiences.</em>
          </>
        }
        description="Digital solutions built for businesses — live websites across e-commerce, education, interiors, hospitality, travel and technology, in India and abroad."
        actions={
          <>
            <Button href="/contact" size="lg">
              Start Your Project
            </Button>
            <Button
              href={siteConfig.whatsappUrl}
              external
              variant="secondary"
              size="lg"
              icon={<MessageCircle size={17} strokeWidth={1.8} />}
              arrow={false}
            >
              Chat on WhatsApp
            </Button>
          </>
        }
        aside={
          <StatsPanel>
            <Stats>
              <Stat>
                <strong>{String(projects.length).padStart(2, '0')}</strong>
                <span>Live projects</span>
              </Stat>
              <Stat>
                <strong>{String(industries).padStart(2, '0')}</strong>
                <span>Industries</span>
              </Stat>
            </Stats>
            <StatsNote>
              Every project shown here is live and belongs to a real business.
              Visit any of them to see the work in action.
            </StatsNote>
          </StatsPanel>
        }
      />

      <Section aria-labelledby="portfolio-heading">
        <Container $width="wide">
          <SectionHeading
            eyebrow="Selected Work"
            title={
              <>
                Digital solutions built for <em>businesses.</em>
              </>
            }
            description="Each project started with a specific problem. These are the solutions that went live."
            headingId="portfolio-heading"
          />

          <Grid style={{ marginTop: 'clamp(2.5rem, 5vw, 3.5rem)' }}>
            {projects.map((project, index) => {
              const wide = project.slug === 'rooteco';
              return (
                <Reveal
                  key={project.slug}
                  delay={(index % 2) * 0.08}
                  y={22}
                  className={wide ? 'wide-card' : undefined}
                >
                  <ProjectCard project={project} wide={wide} />
                </Reveal>
              );
            })}
          </Grid>
        </Container>
      </Section>

      <CtaSection
        eyebrow="Your project next"
        title={
          <>
            Have something <em>worth building?</em>
          </>
        }
        description="Tell us what you are working on. We will reply with a clear view of how we can help, what it would take and where to begin."
      />
    </>
  );
}
