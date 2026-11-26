'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import styled from 'styled-components';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import Icon from '@/components/ui/Icon';
import Reveal from '@/components/ui/Reveal';
import Button from '@/components/ui/Button';
import { serviceCategories } from '@/data/services';
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
  grid-template-columns: repeat(3, 1fr);
  gap: 0.9rem;

  ${media.down('md')} {
    grid-template-columns: repeat(2, 1fr);
  }

  ${media.down('sm')} {
    grid-template-columns: 1fr;
  }
`;

const Card = styled(Link)`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  padding: 1.6rem 1.6rem 1.4rem;
  min-height: 100%;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.gradients.card};
  overflow: hidden;
  transition:
    transform 0.45s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.35s ease;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(420px circle at 15% 0%, rgba(124, 92, 255, 0.16), transparent 65%);
    opacity: 0;
    transition: opacity 0.4s ease;
    pointer-events: none;
  }

  &:hover {
    transform: translateY(-5px);
    border-color: ${({ theme }) => theme.colors.violetLine};
  }

  &:hover::before {
    opacity: 1;
  }

  &:hover .card-arrow {
    transform: translate(3px, -3px);
    border-color: ${({ theme }) => theme.colors.violetLine};
    background: ${({ theme }) => theme.colors.violetWash};
    color: ${({ theme }) => theme.colors.violetSoft};
  }

  &:hover .card-icon {
    background: linear-gradient(135deg, rgba(124, 92, 255, 0.32), rgba(77, 141, 255, 0.18));
    border-color: ${({ theme }) => theme.colors.violetLine};
    color: ${({ theme }) => theme.colors.violetSoft};
  }
`;

const Top = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  position: relative;
  z-index: 1;
`;

const IconBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: rgba(255, 255, 255, 0.03);
  color: ${({ theme }) => theme.colors.textSoft};
  transition:
    background 0.35s ease,
    border-color 0.35s ease,
    color 0.35s ease;
`;

const Index = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  color: ${({ theme }) => theme.colors.faint};
`;

const Body = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  flex: 1;
`;

const Title = styled.h3`
  font-size: clamp(1.08rem, 1.8vw, 1.28rem);
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.2;
`;

const Copy = styled.p`
  font-size: 0.88rem;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.muted};
`;

const Price = styled.p`
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.faint};

  strong {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 0.98rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Learn = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 1.05rem;
  border-top: 1px solid ${({ theme }) => theme.colors.lineSoft};
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.colors.textSoft};
`;

const Arrow = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid ${({ theme }) => theme.colors.line};
  color: ${({ theme }) => theme.colors.textSoft};
  transition:
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    background-color 0.3s ease,
    border-color 0.3s ease,
    color 0.3s ease;
`;

const LinkWrap = styled.div`
  flex-shrink: 0;
  padding-bottom: 0.4rem;
`;

export default function ServicesOverview({ showHeaderLink = true }) {
  return (
    <Section id="services" aria-labelledby="services-heading">
      <Container>
        <Head>
          <SectionHeading
            eyebrow="Services"
            title={
              <>
                Everything Your Business <em>Needs to Grow.</em>
              </>
            }
            description="Five connected capabilities — websites, software, marketing, creative and technical support — from the first conversation to the systems that keep the business running."
            headingId="services-heading"
          />
          {showHeaderLink ? (
            <LinkWrap>
              <Button href="/services" variant="ghost">
                All services
              </Button>
            </LinkWrap>
          ) : null}
        </Head>

        <Grid>
          {serviceCategories.map((category, index) => (
            <Reveal key={category.slug} delay={(index % 3) * 0.06} y={18}>
              <Card href={`/services#${category.slug}`}>
                <Top>
                  <IconBadge className="card-icon">
                    <Icon name={category.icon} size={22} />
                  </IconBadge>
                  <Index>{String(index + 1).padStart(2, '0')}</Index>
                </Top>
                <Body>
                  <Title>{category.title}</Title>
                  <Copy>{category.short}</Copy>
                  <Price>
                    Starting at <strong>{category.startingPrice}</strong>
                  </Price>
                  <Learn>
                    <span>Learn more</span>
                    <Arrow className="card-arrow" aria-hidden="true">
                      <ArrowUpRight size={16} strokeWidth={1.9} />
                    </Arrow>
                  </Learn>
                </Body>
              </Card>
            </Reveal>
          ))}
        </Grid>
      </Container>
    </Section>
  );
}
