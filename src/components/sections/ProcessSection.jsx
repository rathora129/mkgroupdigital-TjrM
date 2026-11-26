'use client';

import styled from 'styled-components';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import Reveal from '@/components/ui/Reveal';
import { processSteps } from '@/data/content';
import { media } from '@/styles/theme';

const Steps = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1.25rem;
  margin-top: clamp(2.75rem, 5vw, 4rem);

  ${media.down('lg')} {
    grid-template-columns: repeat(3, 1fr);
    row-gap: 2.25rem;
  }

  ${media.down('md')} {
    grid-template-columns: 1fr;
    gap: 0;
    margin-top: 2.5rem;
  }
`;

const Connector = styled.div`
  position: absolute;
  top: 5px;
  left: 6%;
  right: 6%;
  height: 1px;
  background: linear-gradient(
    90deg,
    rgba(124, 92, 255, 0.05),
    rgba(124, 92, 255, 0.55) 18%,
    rgba(77, 141, 255, 0.45) 82%,
    rgba(77, 141, 255, 0.05)
  );

  ${media.down('lg')} {
    display: none;
  }

  ${media.down('md')} {
    display: block;
    top: 6px;
    bottom: 6px;
    left: 4px;
    right: auto;
    width: 1px;
    height: auto;
    background: linear-gradient(
      180deg,
      rgba(124, 92, 255, 0.05),
      rgba(124, 92, 255, 0.5),
      rgba(77, 141, 255, 0.4),
      rgba(77, 141, 255, 0.05)
    );
  }
`;

const Step = styled.article`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding-top: 2rem;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 2px solid ${({ theme }) => theme.colors.bgSoft};
    background: ${({ theme }) => theme.colors.violet};
    box-shadow: 0 0 0 4px rgba(124, 92, 255, 0.12);
  }

  ${media.down('md')} {
    padding-top: 0;
    padding-left: 2.5rem;
    padding-bottom: 2.25rem;

    &::before {
      top: 6px;
      left: 0;
    }
  }
`;

const Number = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: clamp(2.2rem, 4vw, 3rem);
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.05em;
  color: transparent;
  -webkit-text-stroke: 1px rgba(255, 255, 255, 0.24);
`;

const Title = styled.h3`
  font-size: clamp(1.15rem, 2vw, 1.35rem);
  letter-spacing: -0.025em;
`;

const Text = styled.p`
  font-size: 0.9rem;
  line-height: 1.68;
  color: ${({ theme }) => theme.colors.muted};
  max-width: 260px;

  ${media.down('md')} {
    max-width: 460px;
  }
`;

export default function ProcessSection() {
  return (
    <Section $tone="raised" id="process" aria-labelledby="process-heading">
      <Container>
        <SectionHeading
          eyebrow="Process"
          align="center"
          title={
            <>
              From Idea <em>to Impact.</em>
            </>
          }
          description="A clear, collaborative process designed to keep decisions moving and surprises to a minimum."
          headingId="process-heading"
        />

        <Steps>
          <Connector aria-hidden="true" />
          {processSteps.map((step, index) => (
            <Reveal key={step.number} delay={index * 0.08} y={20}>
              <Step>
                <Number>{step.number}</Number>
                <Title>{step.title}</Title>
                <Text>{step.description}</Text>
              </Step>
            </Reveal>
          ))}
        </Steps>
      </Container>
    </Section>
  );
}
