'use client';

import Link from 'next/link';
import {
  ArrowUpRight,
  Compass,
  Layers,
  LineChart,
  ShieldCheck,
} from 'lucide-react';
import styled from 'styled-components';
import PageHero from '@/components/sections/PageHero';
import Section from '@/components/ui/Section';
import Container from '@/components/ui/Container';
import SectionHeading from '@/components/ui/SectionHeading';
import Reveal from '@/components/ui/Reveal';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import CtaSection from '@/components/sections/CtaSection';
import services from '@/data/services';
import siteConfig from '@/data/site';
import { values } from '@/data/content';
import { media } from '@/styles/theme';

const Facts = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  padding: 1.5rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background:
    radial-gradient(320px circle at 100% 0%, rgba(124, 92, 255, 0.17), transparent 65%),
    ${({ theme }) => theme.colors.card};
`;

const FactsTitle = styled.p`
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.faint};
`;

const Fact = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.lineSoft};

  &:last-child {
    padding-bottom: 0;
    border-bottom: 0;
  }

  span {
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.faint};
  }

  strong {
    max-width: 170px;
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1.45;
    text-align: right;
    color: ${({ theme }) => theme.colors.textSoft};
  }
`;

const Story = styled.div`
  display: grid;
  grid-template-columns: 0.9fr 1.1fr;
  gap: clamp(2rem, 6vw, 5rem);
  align-items: start;

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const StoryCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;

  p {
    font-size: clamp(0.98rem, 1.5vw, 1.08rem);
    line-height: 1.8;
    color: ${({ theme }) => theme.colors.muted};
  }

  strong {
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textSoft};
  }
`;

const PullQuote = styled.blockquote`
  margin-top: 0.75rem;
  padding: 1.4rem 0 1.4rem 1.4rem;
  border-left: 2px solid ${({ theme }) => theme.colors.violet};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: clamp(1.15rem, 2.2vw, 1.45rem);
  line-height: 1.45;
  letter-spacing: -0.025em;
  color: ${({ theme }) => theme.colors.text};
`;

const Values = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: clamp(2.5rem, 5vw, 3.5rem);

  ${media.down('sm')} {
    grid-template-columns: 1fr;
  }
`;

const Value = styled.article`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: clamp(1.5rem, 3vw, 2rem);
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.gradients.card};
  transition:
    border-color 0.3s ease,
    background 0.3s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.violetLine};
  }

  span {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    color: ${({ theme }) => theme.colors.violetSoft};
  }

  h3 {
    font-size: clamp(1.15rem, 2vw, 1.35rem);
    letter-spacing: -0.025em;
  }

  p {
    font-size: 0.92rem;
    line-height: 1.7;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const WorkWays = styled.div`
  display: flex;
  flex-direction: column;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  margin-top: clamp(2.5rem, 5vw, 3.5rem);
`;

const Way = styled.div`
  display: grid;
  grid-template-columns: 52px 0.75fr 1.25fr;
  gap: clamp(1rem, 3vw, 2.5rem);
  align-items: start;
  padding: 1.75rem 0.25rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};

  ${media.down('md')} {
    grid-template-columns: 40px 1fr;
    gap: 0.5rem 1rem;
  }
`;

const WayIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: rgba(255, 255, 255, 0.03);
  color: ${({ theme }) => theme.colors.violetSoft};

  ${media.down('md')} {
    width: 38px;
    height: 38px;
  }
`;

const WayTitle = styled.h3`
  font-size: clamp(1.05rem, 1.8vw, 1.2rem);
  letter-spacing: -0.02em;
`;

const WayCopy = styled.p`
  font-size: 0.92rem;
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.muted};

  ${media.down('md')} {
    grid-column: 2 / -1;
  }
`;

const CapabilityBand = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 2.25rem;
`;

const Capability = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.6rem 0.95rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: rgba(255, 255, 255, 0.02);
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.8rem;
  transition:
    border-color 0.3s ease,
    background 0.3s ease,
    color 0.3s ease;

  svg {
    color: ${({ theme }) => theme.colors.violetSoft};
  }

  &:hover {
    border-color: ${({ theme }) => theme.colors.violetLine};
    background: ${({ theme }) => theme.colors.violetWash};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const ways = [
  {
    icon: Compass,
    title: 'Clarity before commitment',
    copy: 'We start by understanding the business, the audience and the outcome. Scope and direction are agreed before production begins.',
  },
  {
    icon: Layers,
    title: 'Design and engineering, together',
    copy: 'The people designing the experience work alongside the people building it — so the final product behaves the way it was intended.',
  },
  {
    icon: LineChart,
    title: 'Measurement built in',
    copy: 'Analytics, performance and accessibility are part of the build, not a separate phase after launch.',
  },
  {
    icon: ShieldCheck,
    title: 'A partner after launch',
    copy: 'Websites and products keep changing once real people use them. We stay involved for fixes, improvements and the next phase.',
  },
];

export default function AboutView() {
  return (
    <>
      <PageHero
        breadcrumb={[{ name: 'Home', path: '/' }, { name: 'About' }]}
        eyebrow="About MK Group Digital"
        title={
          <>
            We build the digital side
            <br />
            of <em>ambitious businesses.</em>
          </>
        }
        description="MK Group Digital is a full-service digital agency working with businesses in India and around the world. Strategy, design, engineering and growth — handled by one connected team."
        actions={
          <>
            <Button href="/contact" size="lg">
              Start a conversation
            </Button>
            <Button href="/work" variant="secondary" size="lg">
              See our work
            </Button>
          </>
        }
        aside={
          <Facts>
            <FactsTitle>At a glance</FactsTitle>
            <Fact>
              <span>Based in</span>
              <strong>India</strong>
            </Fact>
            <Fact>
              <span>Working with</span>
              <strong>Clients worldwide</strong>
            </Fact>
            <Fact>
              <span>Capabilities</span>
              <strong>Strategy, design, build &amp; growth</strong>
            </Fact>
            <Fact>
              <span>Response time</span>
              <strong>{siteConfig.responseTime}</strong>
            </Fact>
          </Facts>
        }
      />

      <Section aria-labelledby="story-heading">
        <Container>
          <Story>
            <div>
              <SectionHeading
                eyebrow="Why we exist"
                title={
                  <>
                    Good digital work should not get lost <em>between teams.</em>
                  </>
                }
                headingId="story-heading"
              />
            </div>
            <StoryCopy>
              <p>
                Most digital projects do not fail because of a lack of ideas.
                They stall in the gaps — between the strategy deck and the
                design, between the design and the build, between the launch and
                everything that was supposed to happen next.
              </p>
              <p>
                <strong>MK Group Digital exists to close those gaps.</strong> We
                keep strategy, design, engineering and growth in one team, with
                one view of what the business is trying to achieve.
              </p>
              <p>
                We work with businesses of different sizes and at different
                stages — from a first proper website to an e-commerce platform or
                a custom internal system. The common thread is a willingness to
                take the work seriously.
              </p>
              <PullQuote>
                We would rather build one thing properly than ten things quickly.
              </PullQuote>
            </StoryCopy>
          </Story>
        </Container>
      </Section>

      <Section $tone="soft" aria-labelledby="values-heading">
        <Container>
          <SectionHeading
            eyebrow="What guides us"
            title={
              <>
                Principles, not <em>posters.</em>
              </>
            }
            description="These are the standards we use to make decisions when a project gets complicated — which it usually does."
            headingId="values-heading"
          />
          <Values>
            {values.map((value, index) => (
              <Reveal key={value.number} delay={index * 0.06} y={18}>
                <Value>
                  <span>{value.number}</span>
                  <h3>{value.title}</h3>
                  <p>{value.description}</p>
                </Value>
              </Reveal>
            ))}
          </Values>
        </Container>
      </Section>

      <Section aria-labelledby="approach-heading">
        <Container>
          <SectionHeading
            eyebrow="How we work"
            title={
              <>
                Direct, considered, <em>accountable.</em>
              </>
            }
            description="No layers of account management, no black boxes. A clear point of contact and a process you can see."
            headingId="approach-heading"
          />
          <WorkWays>
            {ways.map((way) => {
              const WayIconComponent = way.icon;
              return (
                <Way key={way.title}>
                  <WayIcon>
                    <WayIconComponent size={19} strokeWidth={1.7} />
                  </WayIcon>
                  <WayTitle>{way.title}</WayTitle>
                  <WayCopy>{way.copy}</WayCopy>
                </Way>
              );
            })}
          </WorkWays>
        </Container>
      </Section>

      <Section $tone="soft" aria-labelledby="capabilities-heading">
        <Container>
          <SectionHeading
            eyebrow="Capabilities"
            title={
              <>
                One team, <em>eight disciplines.</em>
              </>
            }
            description="Engage a single capability or bring us in across the whole journey."
            headingId="capabilities-heading"
          />
          <CapabilityBand>
            {services.map((service) => (
              <Capability key={service.slug} href={`/services/${service.slug}`}>
                <Icon name={service.icon} size={15} />
                {service.title}
                <ArrowUpRight size={12} />
              </Capability>
            ))}
          </CapabilityBand>
          <div style={{ marginTop: '2rem' }}>
            <Button href="/services" variant="ghost">
              Explore all services
            </Button>
          </div>
        </Container>
      </Section>

      <CtaSection
        eyebrow="Work with us"
        title={
          <>
            Let&apos;s build something <em>that lasts.</em>
          </>
        }
        description="If you care about the details and want a digital partner who does too, we should talk."
      />
    </>
  );
}
