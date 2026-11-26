'use client';

import {
  BarChart3,
  FileText,
  MessageCircle,
  PanelsTopLeft,
  Users,
  Warehouse,
} from 'lucide-react';
import styled from 'styled-components';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import Reveal from '@/components/ui/Reveal';
import Button from '@/components/ui/Button';
import { softwareSolutions } from '@/data/content';
import siteConfig from '@/data/site';
import { media } from '@/styles/theme';

const icons = {
  MessageCircle,
  Warehouse,
  FileText,
  Users,
  BarChart3,
  PanelsTopLeft,
};

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-top: clamp(2.5rem, 5vw, 3.5rem);

  ${media.down('md')} {
    grid-template-columns: 1fr 1fr;
  }

  ${media.down('sm')} {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.article`
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 1.5rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: rgba(255, 255, 255, 0.02);
  transition:
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.3s ease;

  &:hover {
    transform: translateY(-4px);
    border-color: ${({ theme }) => theme.colors.violetLine};
  }

  svg {
    color: ${({ theme }) => theme.colors.violetSoft};
  }

  h3 {
    font-size: 1.02rem;
    letter-spacing: -0.02em;
  }

  p {
    font-size: 0.86rem;
    line-height: 1.65;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: clamp(2rem, 4vw, 3rem);
`;

export default function BusinessSoftware() {
  return (
    <Section $tone="soft" aria-labelledby="software-heading">
      <Container>
        <SectionHeading
          eyebrow="Business software"
          title={
            <>
              Smart Software for <em>Everyday Business Operations.</em>
            </>
          }
          description="Most growing businesses outgrow notebooks, registers and disconnected spreadsheets. We build practical software for CRM and lead follow-up, inventory and stock, billing, employees and daily operations — so information lives in one system instead of five places."
          headingId="software-heading"
        />

        <Grid>
          {softwareSolutions.map((solution, index) => {
            const SolutionIcon = icons[solution.icon] || PanelsTopLeft;
            return (
              <Reveal key={solution.title} delay={(index % 3) * 0.06} y={18}>
                <Card>
                  <SolutionIcon size={20} strokeWidth={1.7} />
                  <h3>{solution.title}</h3>
                  <p>{solution.description}</p>
                </Card>
              </Reveal>
            );
          })}
        </Grid>

        <Actions>
          <Button href="/contact" size="lg">
            Discuss Your Software Idea
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
        </Actions>
      </Container>
    </Section>
  );
}
