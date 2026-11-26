'use client';

import { MessageCircle } from 'lucide-react';
import styled from 'styled-components';
import PageHero from '@/components/sections/PageHero';
import Section from '@/components/ui/Section';
import Container from '@/components/ui/Container';
import SectionHeading from '@/components/ui/SectionHeading';
import Icon from '@/components/ui/Icon';
import Reveal from '@/components/ui/Reveal';
import Button from '@/components/ui/Button';
import CtaSection from '@/components/sections/CtaSection';
import { industries } from '@/data/industries';
import siteConfig from '@/data/site';
import { media } from '@/styles/theme';

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
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 1.6rem;
  scroll-margin-top: 120px;
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

  &:hover .industry-icon {
    color: ${({ theme }) => theme.colors.violetSoft};
  }
`;

const Top = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.3rem;
`;

const IndustryIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: rgba(255, 255, 255, 0.03);
  color: ${({ theme }) => theme.colors.textSoft};
  transition: color 0.3s ease;
`;

const Index = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 0.7rem;
  letter-spacing: 0.16em;
  color: ${({ theme }) => theme.colors.faint};
`;

const Name = styled.h3`
  font-size: 1.08rem;
  letter-spacing: -0.02em;
`;

const Line = styled.p`
  font-size: 0.86rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textSoft};
`;

const Detail = styled.p`
  font-size: 0.8rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.muted};
`;

const Note = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1.25rem;
  padding: 1rem 1.25rem;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.colors.bgSoft};

  p {
    font-size: 0.86rem;
    color: ${({ theme }) => theme.colors.textSoft};
  }
`;

export default function IndustriesView() {
  return (
    <>
      <PageHero
        breadcrumb={[{ name: 'Home', path: '/' }, { name: 'Industries' }]}
        eyebrow="Industries"
        title={
          <>
            Built around your <em>industry.</em>
          </>
        }
        description="Retail counters, classrooms, clinics, resorts, factories and fast-moving startups — each has different systems, customers and constraints. We plan the work around yours."
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
      />

      <Section aria-labelledby="industries-list-heading">
        <Container>
          <SectionHeading
            eyebrow="Where we work"
            title={
              <>
                Industries we <em>serve.</em>
              </>
            }
            description="The same standard applies everywhere: understand the customer, the operation and the commercial reality before proposing anything."
            headingId="industries-list-heading"
          />

          <Grid>
            {industries.map((industry, index) => (
              <Reveal key={industry.slug} delay={(index % 3) * 0.05} y={18}>
                <Card id={industry.slug}>
                  <Top>
                    <IndustryIcon className="industry-icon">
                      <Icon name={industry.icon} size={22} />
                    </IndustryIcon>
                    <Index>{String(index + 1).padStart(2, '0')}</Index>
                  </Top>
                  <Name>{industry.name}</Name>
                  <Line>{industry.line}</Line>
                  <Detail>{industry.detail}</Detail>
                </Card>
              </Reveal>
            ))}
          </Grid>

          <Note>
            <p>
              Do not see your industry? The work is the same — understand the
              business first, then build the right website, software or campaign.
            </p>
            <Button href="/contact" variant="secondary" size="sm">
              Describe your project
            </Button>
          </Note>
        </Container>
      </Section>

      <CtaSection />
    </>
  );
}
