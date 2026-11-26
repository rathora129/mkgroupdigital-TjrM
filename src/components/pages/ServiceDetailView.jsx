'use client';

import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  MessageCircle,
} from 'lucide-react';
import styled from 'styled-components';
import PageHero from '@/components/sections/PageHero';
import Section from '@/components/ui/Section';
import Container from '@/components/ui/Container';
import SectionHeading from '@/components/ui/SectionHeading';
import Reveal from '@/components/ui/Reveal';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import ServiceCard from '@/components/ui/ServiceCard';
import CtaSection from '@/components/sections/CtaSection';
import siteConfig from '@/data/site';
import services, { getRelatedServices } from '@/data/services';
import { media } from '@/styles/theme';

const Seal = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
  width: 100%;
  padding: 1.6rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background:
    radial-gradient(340px circle at 100% 0%, rgba(124, 92, 255, 0.18), transparent 65%),
    ${({ theme }) => theme.colors.card};
  box-shadow: ${({ theme }) => theme.shadow.card};
`;

const SealTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
`;

const SealIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 15px;
  border: 1px solid ${({ theme }) => theme.colors.violetLine};
  background: ${({ theme }) => theme.colors.violetWash};
  color: ${({ theme }) => theme.colors.violetSoft};
`;

const SealIndex = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 2.4rem;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.06em;
  color: transparent;
  -webkit-text-stroke: 1px rgba(255, 255, 255, 0.22);
`;

const SealName = styled.p`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 1.3rem;
  font-weight: 600;
  letter-spacing: -0.03em;
`;

const SealMeta = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  list-style: none;

  li {
    padding: 0.32rem 0.6rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.line};
    font-size: 0.68rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.faint};
  }
`;

const SealNote = styled.p`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.9rem;
  border-top: 1px solid ${({ theme }) => theme.colors.lineSoft};
  font-size: 0.76rem;
  color: ${({ theme }) => theme.colors.muted};

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.success};
    box-shadow: 0 0 0 4px rgba(87, 214, 164, 0.1);
  }
`;

const IntroGrid = styled.div`
  display: grid;
  grid-template-columns: 0.9fr 1.1fr;
  gap: clamp(2rem, 6vw, 5rem);
  align-items: start;

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const Copy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.15rem;

  p {
    font-size: clamp(0.98rem, 1.5vw, 1.08rem);
    line-height: 1.78;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const Offerings = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;

  ${media.down('sm')} {
    grid-template-columns: 1fr;
  }
`;

const Offering = styled.article`
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 1.35rem;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.colors.card};
  transition:
    border-color 0.3s ease,
    background 0.3s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.violetLine};
    background: ${({ theme }) => theme.colors.cardHover};
  }

  span {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 0.68rem;
    letter-spacing: 0.16em;
    color: ${({ theme }) => theme.colors.violetSoft};
  }

  h3 {
    font-size: 1rem;
    letter-spacing: -0.02em;
  }

  p {
    font-size: 0.84rem;
    line-height: 1.6;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const Benefits = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: clamp(2.5rem, 5vw, 3.5rem);

  ${media.down('sm')} {
    grid-template-columns: 1fr;
  }
`;

const Benefit = styled.article`
  display: flex;
  gap: 1rem;
  padding: 1.5rem;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: rgba(255, 255, 255, 0.02);
`;

const Tick = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.violetWash};
  border: 1px solid ${({ theme }) => theme.colors.violetLine};
  color: ${({ theme }) => theme.colors.violetSoft};
`;

const BenefitBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;

  h3 {
    font-size: 1.02rem;
    letter-spacing: -0.02em;
  }

  p {
    font-size: 0.87rem;
    line-height: 1.65;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const StepsWrap = styled.div`
  display: grid;
  grid-template-columns: 0.8fr 1.2fr;
  gap: clamp(2rem, 6vw, 5rem);
  align-items: start;

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const Sticky = styled.div`
  position: sticky;
  top: 130px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;

  ${media.down('md')} {
    position: static;
  }
`;

const StepList = styled.ol`
  list-style: none;
  display: flex;
  flex-direction: column;
`;

const Step = styled.li`
  position: relative;
  display: grid;
  grid-template-columns: 74px 1fr;
  gap: 1.25rem;
  padding: 0 0 2rem 0;

  &:last-child {
    padding-bottom: 0;
  }

  &:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 34px;
    top: 46px;
    bottom: 0;
    width: 1px;
    background: linear-gradient(
      180deg,
      rgba(124, 92, 255, 0.35),
      rgba(255, 255, 255, 0.06)
    );
  }
`;

const StepNumber = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 68px;
  height: 68px;
  border-radius: 50%;
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.colors.bgRaised};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 1.1rem;
  color: ${({ theme }) => theme.colors.violetSoft};
`;

const StepBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 0.7rem;

  h3 {
    font-size: clamp(1.15rem, 2vw, 1.35rem);
    letter-spacing: -0.025em;
  }

  p {
    font-size: 0.92rem;
    line-height: 1.7;
    color: ${({ theme }) => theme.colors.muted};
    max-width: 560px;
  }
`;

const RelatedGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-top: clamp(2.5rem, 5vw, 3.5rem);

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const SectionFoot = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 2.25rem;
`;

const WorkLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  color: ${({ theme }) => theme.colors.violetSoft};
  font-size: 0.88rem;
  font-weight: 600;

  svg {
    transition: transform 0.3s ease;
  }

  &:hover svg {
    transform: translate(2px, -2px);
  }
`;

export default function ServiceDetailView({ service }) {
  const index = services.findIndex((item) => item.slug === service.slug);
  const related = getRelatedServices(service.related);

  return (
    <>
      <PageHero
        breadcrumb={[
          { name: 'Home', path: '/' },
          { name: 'Services', path: '/services' },
          { name: service.title },
        ]}
        eyebrow={`Service ${String(index + 1).padStart(2, '0')} · ${service.shortTitle}`}
        title={service.headline}
        description={service.intro}
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
          <Seal>
            <SealTop>
              <SealIcon>
                <Icon name={service.icon} size={24} />
              </SealIcon>
              <SealIndex aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </SealIndex>
            </SealTop>
            <SealName>{service.title}</SealName>
            <SealMeta>
              <li>Strategy</li>
              <li>Design</li>
              <li>Build</li>
              <li>Grow</li>
            </SealMeta>
            <SealNote>{siteConfig.responseTime}</SealNote>
          </Seal>
        }
      />

      <Section aria-labelledby="scope-heading">
        <Container>
          <IntroGrid>
            <div>
              <SectionHeading
                eyebrow="The work"
                title={
                  <>
                    What this <em>involves.</em>
                  </>
                }
                headingId="scope-heading"
              />
              <Copy style={{ marginTop: '1.5rem' }}>
                {service.description.map((paragraph) => (
                  <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                ))}
                <WorkLink href="/work">
                  See how this looks in practice <ArrowUpRight size={15} />
                </WorkLink>
              </Copy>
            </div>

            <Offerings>
              {service.offerings.map((offering, offeringIndex) => (
                <Offering key={offering.title}>
                  <span>{String(offeringIndex + 1).padStart(2, '0')}</span>
                  <h3>{offering.title}</h3>
                  <p>{offering.description}</p>
                </Offering>
              ))}
            </Offerings>
          </IntroGrid>
        </Container>
      </Section>

      <Section $tone="soft" aria-labelledby="benefits-heading">
        <Container>
          <SectionHeading
            eyebrow="What it gives you"
            title={
              <>
                Built for the <em>long term.</em>
              </>
            }
            description="The practical outcomes this work is designed to support — not promises, but the standards we hold the work to."
            headingId="benefits-heading"
          />
          <Benefits>
            {service.benefits.map((benefit, benefitIndex) => (
              <Reveal key={benefit.title} delay={benefitIndex * 0.06} y={18}>
                <Benefit>
                  <Tick>
                    <Check size={15} strokeWidth={2.4} />
                  </Tick>
                  <BenefitBody>
                    <h3>{benefit.title}</h3>
                    <p>{benefit.description}</p>
                  </BenefitBody>
                </Benefit>
              </Reveal>
            ))}
          </Benefits>
        </Container>
      </Section>

      <Section aria-labelledby="delivery-heading">
        <Container>
          <StepsWrap>
            <Sticky>
              <SectionHeading
                eyebrow="How we deliver"
                title={
                  <>
                    A clear path, <em>start to finish.</em>
                  </>
                }
                description="A focused delivery rhythm with review points built in, so progress is visible and decisions are made with context."
                headingId="delivery-heading"
              />
              <Button href="/contact" variant="secondary">
                Discuss your project
              </Button>
            </Sticky>

            <StepList>
              {service.process.map((step, stepIndex) => (
                <Step key={step.title}>
                  <StepNumber>
                    {String(stepIndex + 1).padStart(2, '0')}
                  </StepNumber>
                  <StepBody>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </StepBody>
                </Step>
              ))}
            </StepList>
          </StepsWrap>
        </Container>
      </Section>

      <Section $tone="soft" aria-labelledby="related-heading">
        <Container>
          <SectionHeading
            eyebrow="Related services"
            title={
              <>
                Often paired <em>with this.</em>
              </>
            }
            description="Capabilities that frequently work alongside this service on the same brief."
            headingId="related-heading"
          />
          <RelatedGrid>
            {related.map((item, relatedIndex) => (
              <Reveal key={item.slug} delay={relatedIndex * 0.07} y={20}>
                <ServiceCard service={item} index={relatedIndex} />
              </Reveal>
            ))}
          </RelatedGrid>
          <SectionFoot>
            <Button href="/services" variant="ghost">
              View all services
            </Button>
          </SectionFoot>
        </Container>
      </Section>

      <CtaSection
        eyebrow="Next step"
        description={`Tell us what you need from ${service.shortTitle.toLowerCase()} and where the business is trying to get to. We will take it from there.`}
      />
    </>
  );
}
