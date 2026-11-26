'use client';

import styled from 'styled-components';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import ProjectCard from '@/components/ui/ProjectCard';
import Reveal from '@/components/ui/Reveal';
import Button from '@/components/ui/Button';
import { featuredProjects } from '@/data/projects';
import { media } from '@/styles/theme';

const Head = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
  margin-bottom: clamp(2.5rem, 5vw, 3.5rem);

  ${media.down('md')} {
    flex-direction: column;
    align-items: flex-start;
    gap: 1.5rem;
  }
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

const LinkWrap = styled.div`
  flex-shrink: 0;
  padding-bottom: 0.4rem;
`;

export default function FeaturedWork({ showHeaderLink = true }) {
  return (
    <Section id="work" aria-labelledby="work-heading">
      <Container $width="wide">
        <Head>
          <SectionHeading
            eyebrow="Selected work"
            title={
              <>
                Selected <em>Work.</em>
              </>
            }
            description="A selection of live websites and platforms across e-commerce, education, interiors, hospitality, travel and technology."
            headingId="work-heading"
          />
          {showHeaderLink ? (
            <LinkWrap>
              <Button href="/work" variant="ghost">
                View all work
              </Button>
            </LinkWrap>
          ) : null}
        </Head>

        <Grid>
          {featuredProjects.map((project, index) => (
            <Reveal
              key={project.slug}
              delay={(index % 2) * 0.08}
              y={22}
              className={project.slug === 'rooteco' ? 'wide-card' : undefined}
            >
              <ProjectCard project={project} wide={project.slug === 'rooteco'} />
            </Reveal>
          ))}
        </Grid>
      </Container>
    </Section>
  );
}
