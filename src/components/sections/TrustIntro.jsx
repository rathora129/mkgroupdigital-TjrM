'use client';

import styled from 'styled-components';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import Icon from '@/components/ui/Icon';
import Button from '@/components/ui/Button';
import Reveal from '@/components/ui/Reveal';
import { trust } from '@/data/home';
import { media } from '@/styles/theme';

const Layout = styled.div`
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: clamp(2.5rem, 6vw, 5.5rem);
  align-items: center;

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const Copy = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.25rem;
`;

const Note = styled.p`
  max-width: 540px;
  padding-left: 1rem;
  border-left: 2px solid ${({ theme }) => theme.colors.violetLine};
  font-size: 0.86rem;
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.faint};
`;

const Pillars = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const Pillar = styled.div`
  display: grid;
  grid-template-columns: 46px 1fr;
  gap: 1rem;
  align-items: start;
  padding: 1.25rem 1.35rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.gradients.card};
  transition:
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.3s ease;

  &:hover {
    transform: translateX(4px);
    border-color: ${({ theme }) => theme.colors.violetLine};
  }

  h3 {
    font-size: 1.05rem;
    letter-spacing: -0.02em;
    margin-bottom: 0.25rem;
  }

  p {
    font-size: 0.85rem;
    line-height: 1.6;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const PillarIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.violetLine};
  background: ${({ theme }) => theme.colors.violetWash};
  color: ${({ theme }) => theme.colors.violetSoft};
`;

export default function TrustIntro() {
  return (
    <Section $tone="soft" $divider aria-labelledby="trust-heading">
      <Container>
        <Layout>
          <Copy>
            <SectionHeading
              eyebrow={trust.eyebrow}
              title={
                <>
                  One partner for technology and{' '}
                  <em>digital growth.</em>
                </>
              }
              description={trust.description}
              headingId="trust-heading"
            />
            <Note>{trust.note}</Note>
            <Button href={trust.cta.href} variant="secondary">
              {trust.cta.label}
            </Button>
          </Copy>

          <Pillars>
            {trust.pillars.map((pillar, index) => (
              <Reveal key={pillar.title} delay={index * 0.08} y={16}>
                <Pillar>
                  <PillarIcon>
                    <Icon name={pillar.icon} size={21} />
                  </PillarIcon>
                  <div>
                    <h3>{pillar.title}</h3>
                    <p>{pillar.text}</p>
                  </div>
                </Pillar>
              </Reveal>
            ))}
          </Pillars>
        </Layout>
      </Container>
    </Section>
  );
}
