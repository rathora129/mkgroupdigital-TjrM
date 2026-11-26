'use client';

import { Check, MessageCircle, ShieldCheck } from 'lucide-react';
import styled from 'styled-components';
import PageHero from '@/components/sections/PageHero';
import Section from '@/components/ui/Section';
import Container from '@/components/ui/Container';
import SectionHeading from '@/components/ui/SectionHeading';
import Reveal from '@/components/ui/Reveal';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import CtaSection from '@/components/sections/CtaSection';
import { pricingGroups, pricingNotes } from '@/data/pricing';
import siteConfig from '@/data/site';
import { media } from '@/styles/theme';

const Group = styled.section`
  scroll-margin-top: 120px;

  & + & {
    margin-top: clamp(3.5rem, 7vw, 5.5rem);
  }
`;

const GroupHead = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 1.1rem;
  margin-bottom: clamp(1.75rem, 4vw, 2.5rem);

  svg {
    flex-shrink: 0;
    margin-top: 0.35rem;
    color: ${({ theme }) => theme.colors.violetSoft};
  }
`;

const GroupTitle = styled.h2`
  font-size: clamp(1.5rem, 3.4vw, 2.2rem);
  letter-spacing: -0.035em;
`;

const GroupNote = styled.p`
  max-width: 640px;
  margin-top: 0.5rem;
  font-size: 0.92rem;
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.muted};
`;

const Plans = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.9rem;

  ${media.down('xl')} {
    grid-template-columns: repeat(2, 1fr);
  }

  ${media.down('sm')} {
    grid-template-columns: 1fr;
  }
`;

const Plan = styled.article`
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  padding: 1.6rem 1.5rem 1.5rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.gradients.card};
  transition:
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.3s ease;

  &:hover {
    transform: translateY(-4px);
    border-color: ${({ theme }) => theme.colors.violetLine};
  }
`;

const PlanName = styled.h3`
  font-size: 1.05rem;
  letter-spacing: -0.02em;
`;

const PlanPrice = styled.p`
  display: flex;
  align-items: baseline;
  gap: 0.35rem;

  strong {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: clamp(1.5rem, 2.6vw, 1.85rem);
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  span {
    font-size: 0.74rem;
    color: ${({ theme }) => theme.colors.faint};
  }
`;

const Features = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  flex: 1;
  padding-top: 1rem;
  border-top: 1px solid ${({ theme }) => theme.colors.lineSoft};

  li {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.83rem;
    line-height: 1.5;
    color: ${({ theme }) => theme.colors.textSoft};

    svg {
      flex-shrink: 0;
      margin-top: 0.15rem;
      color: ${({ theme }) => theme.colors.success};
    }
  }
`;

const NotesPanel = styled.div`
  margin-top: clamp(3rem, 6vw, 4.5rem);
  padding: clamp(1.5rem, 4vw, 2.25rem);
  border-radius: ${({ theme }) => theme.radius.xl};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background:
    radial-gradient(480px circle at 0% 0%, rgba(124, 92, 255, 0.1), transparent 60%),
    ${({ theme }) => theme.colors.card};
`;

const NotesTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: clamp(1.15rem, 2.4vw, 1.45rem);
  letter-spacing: -0.03em;
  margin-bottom: 1.1rem;

  svg {
    color: ${({ theme }) => theme.colors.violetSoft};
    flex-shrink: 0;
  }
`;

const NotesList = styled.ul`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem 2rem;

  li {
    position: relative;
    padding-left: 1.1rem;
    font-size: 0.86rem;
    line-height: 1.65;
    color: ${({ theme }) => theme.colors.muted};

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0.55em;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: ${({ theme }) => theme.colors.violet};
    }
  }

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

export default function PricingView() {
  return (
    <>
      <PageHero
        breadcrumb={[{ name: 'Home', path: '/' }, { name: 'Pricing' }]}
        eyebrow="Pricing"
        title={
          <>
            Clear starting prices.
            <br />
            No <em>surprises.</em>
          </>
        }
        description="Transparent, indicative starting prices for websites, business software and digital marketing. Every project is confirmed with a written quote before work begins."
        actions={
          <>
            <Button href="/contact" size="lg">
              Get a Custom Quote
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
      />

      <Section aria-label="Pricing details">
        <Container $width="wide">
          {pricingGroups.map((group) => (
            <Group key={group.id} id={`pricing-${group.id}`} aria-labelledby={`pricing-${group.id}-heading`}>
              <GroupHead>
                <Icon name={group.icon} size={26} strokeWidth={1.6} />
                <div>
                  <GroupTitle id={`pricing-${group.id}-heading`}>
                    {group.title}
                  </GroupTitle>
                  <GroupNote>{group.note}</GroupNote>
                </div>
              </GroupHead>

              <Plans>
                {group.plans.map((plan, index) => (
                  <Reveal key={plan.name} delay={(index % 4) * 0.05} y={18}>
                    <Plan>
                      <PlanName>{plan.name}</PlanName>
                      <PlanPrice>
                        <strong>{plan.price}</strong>
                        <span>{plan.cadence}</span>
                      </PlanPrice>
                      <Features>
                        {plan.features.map((feature) => (
                          <li key={feature}>
                            <Check size={14} strokeWidth={2.4} />
                            {feature}
                          </li>
                        ))}
                      </Features>
                      <Button
                        href="/contact"
                        variant="secondary"
                        full
                        arrow={false}
                      >
                        Get a Custom Quote
                      </Button>
                    </Plan>
                  </Reveal>
                ))}
              </Plans>
            </Group>
          ))}

          <Reveal y={18}>
            <NotesPanel>
              <NotesTitle>
                <ShieldCheck size={20} strokeWidth={1.7} />
                How to read these prices
              </NotesTitle>
              <NotesList>
                {pricingNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </NotesList>
            </NotesPanel>
          </Reveal>
        </Container>
      </Section>

      <CtaSection
        eyebrow="Ready when you are"
        title={
          <>
            Have a project in <em>mind?</em>
          </>
        }
        description="Tell us what you are building and we will send a written proposal with scope, timeline and cost — usually within two business days."
      />
    </>
  );
}
