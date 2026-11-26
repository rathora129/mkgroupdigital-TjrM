'use client';

import Link from 'next/link';
import { ArrowUpRight, MessageCircle, Sparkles } from 'lucide-react';
import styled from 'styled-components';
import PageHero from '@/components/sections/PageHero';
import Section from '@/components/ui/Section';
import Container from '@/components/ui/Container';
import SectionHeading from '@/components/ui/SectionHeading';
import Reveal from '@/components/ui/Reveal';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import ProcessSection from '@/components/sections/ProcessSection';
import CtaSection from '@/components/sections/CtaSection';
import { serviceCategories, services } from '@/data/services';
import siteConfig from '@/data/site';
import { media } from '@/styles/theme';

const CapabilityGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.55rem;
  width: 100%;
  padding: 1rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.gradients.card};
  box-shadow: ${({ theme }) => theme.shadow.card};
`;

const Capability = styled(Link)`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.7rem 0.75rem;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid transparent;
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.76rem;
  line-height: 1.2;
  transition:
    background 0.3s ease,
    border-color 0.3s ease,
    color 0.3s ease;

  svg {
    color: ${({ theme }) => theme.colors.violetSoft};
    flex-shrink: 0;
  }

  &:hover {
    background: ${({ theme }) => theme.colors.violetWash};
    border-color: ${({ theme }) => theme.colors.violetLine};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const CategoryGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.1rem;
  margin-top: clamp(2.5rem, 5vw, 3.75rem);

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const Category = styled.article`
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  padding: clamp(1.5rem, 3vw, 2.1rem);
  scroll-margin-top: 120px;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.gradients.card};
  transition:
    transform 0.45s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.35s ease;

  &:last-child {
    grid-column: 1 / -1;
  }

  &:hover {
    transform: translateY(-4px);
    border-color: ${({ theme }) => theme.colors.violetLine};
  }

  ${media.down('md')} {
    &:last-child {
      grid-column: auto;
    }
  }
`;

const CategoryHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
`;

const CategoryGlyph = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  border-radius: 15px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: rgba(255, 255, 255, 0.03);
  color: ${({ theme }) => theme.colors.violetSoft};
`;

const CategoryIndex = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  color: ${({ theme }) => theme.colors.faint};
`;

const CategoryTitle = styled.h3`
  font-size: clamp(1.25rem, 2.4vw, 1.55rem);
  letter-spacing: -0.03em;
`;

const CategoryCopy = styled.p`
  font-size: 0.92rem;
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.muted};
`;

const ItemGrid = styled.ul`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem 1rem;
  padding-top: 1.1rem;
  border-top: 1px solid ${({ theme }) => theme.colors.lineSoft};

  li {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.83rem;
    line-height: 1.45;
    color: ${({ theme }) => theme.colors.textSoft};

    &::before {
      content: '';
      flex-shrink: 0;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: ${({ theme }) => theme.colors.violet};
      transform: translateY(-2px);
    }
  }

  ${media.down('xs')} {
    grid-template-columns: 1fr;
  }
`;

const CategoryFoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding-top: 1.1rem;
  border-top: 1px solid ${({ theme }) => theme.colors.lineSoft};
`;

const StartingPrice = styled.span`
  font-size: 0.76rem;
  color: ${({ theme }) => theme.colors.faint};

  strong {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: ${({ theme }) => theme.colors.text};
  }
`;

const CategoryLinks = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`;

const DetailLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  font-size: 0.74rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSoft};
  transition:
    border-color 0.3s ease,
    background 0.3s ease,
    color 0.3s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.violetLine};
    background: ${({ theme }) => theme.colors.violetWash};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Models = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-top: clamp(2.5rem, 5vw, 3.5rem);

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const Model = styled.article`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.8rem;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.colors.card};

  span {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    color: ${({ theme }) => theme.colors.violetSoft};
  }

  h3 {
    font-size: 1.18rem;
    letter-spacing: -0.025em;
  }

  p {
    font-size: 0.9rem;
    line-height: 1.65;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const Note = styled.div`
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-top: 1.25rem;
  padding: 0.9rem 1.1rem;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid rgba(87, 214, 164, 0.18);
  background: rgba(87, 214, 164, 0.05);
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.82rem;
  line-height: 1.5;

  svg {
    color: ${({ theme }) => theme.colors.success};
    flex-shrink: 0;
  }
`;

export default function ServicesIndexView() {
  return (
    <>
      <PageHero
        breadcrumb={[{ name: 'Home', path: '/' }, { name: 'Services' }]}
        eyebrow="Services"
        title={
          <>
            Everything your business
            <br />
            needs to <em>grow.</em>
          </>
        }
        description="Websites, e-commerce, custom software, IT support, digital marketing and creative — complete technology and digital solutions from one partner."
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
              WhatsApp Us
            </Button>
          </>
        }
        aside={
          <CapabilityGrid aria-label="Service categories">
            {serviceCategories.map((category) => (
              <Capability key={category.slug} href={`/services#${category.slug}`}>
                <Icon name={category.icon} size={16} />
                {category.title}
              </Capability>
            ))}
          </CapabilityGrid>
        }
      />

      <Section aria-labelledby="catalog-heading">
        <Container $width="wide">
          <SectionHeading
            eyebrow="Full service catalog"
            title={
              <>
                Five capabilities. <em>One connected partner.</em>
              </>
            }
            description="Every category is planned and delivered by MK Group Digital, so strategy, design, build and growth stay connected from day one. Prices shown are indicative starting points."
            headingId="catalog-heading"
          />

          <CategoryGrid>
            {serviceCategories.map((category, index) => (
              <Reveal key={category.slug} delay={(index % 2) * 0.07} y={20}>
                <Category id={category.slug}>
                  <CategoryHead>
                    <CategoryGlyph>
                      <Icon name={category.icon} size={22} />
                    </CategoryGlyph>
                    <CategoryIndex>
                      {String(index + 1).padStart(2, '0')}
                    </CategoryIndex>
                  </CategoryHead>
                  <div>
                    <CategoryTitle>{category.title}</CategoryTitle>
                    <CategoryCopy style={{ marginTop: '0.6rem' }}>
                      {category.short}
                    </CategoryCopy>
                  </div>
                  <ItemGrid>
                    {category.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ItemGrid>
                  <CategoryFoot>
                    <StartingPrice>
                      Starting at <strong>{category.startingPrice}</strong>
                    </StartingPrice>
                    <CategoryLinks>
                      {category.services.map((slug) => {
                        const service = services.find((item) => item.slug === slug);
                        return service ? (
                          <DetailLink key={slug} href={`/services/${slug}`}>
                            {service.shortTitle}
                            <ArrowUpRight size={12} />
                          </DetailLink>
                        ) : null;
                      })}
                      <DetailLink href="/pricing">Pricing</DetailLink>
                    </CategoryLinks>
                  </CategoryFoot>
                </Category>
              </Reveal>
            ))}
          </CategoryGrid>

          <Note>
            <Sparkles size={16} />
            Not sure where to start? Tell us the outcome you need — we will
            recommend the right mix, not the biggest one.
          </Note>
        </Container>
      </Section>

      <Section $tone="soft" aria-labelledby="models-heading">
        <Container>
          <SectionHeading
            eyebrow="Engagements"
            title={
              <>
                Three ways to <em>work together.</em>
              </>
            }
            description="Every engagement is scoped around what the business needs now, with a clear path to what comes next."
            headingId="models-heading"
          />
          <Models>
            <Model>
              <span>01</span>
              <h3>A focused project</h3>
              <p>
                A defined website, brand or platform build — planned, designed,
                developed and delivered as one engagement.
              </p>
            </Model>
            <Model>
              <span>02</span>
              <h3>An ongoing partnership</h3>
              <p>
                Continuous design, development and growth support for teams that
                ship regularly and need a dependable digital partner.
              </p>
            </Model>
            <Model>
              <span>03</span>
              <h3>A product build</h3>
              <p>
                End-to-end delivery of a custom application, from workflow mapping
                and architecture through to launch and iteration.
              </p>
            </Model>
          </Models>
          <Note>
            <Sparkles size={16} />
            Scope, timeline and investment are agreed in writing before work
            begins. No open-ended estimates.
          </Note>
        </Container>
      </Section>

      <ProcessSection />
      <CtaSection />
    </>
  );
}
