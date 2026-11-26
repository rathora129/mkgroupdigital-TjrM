'use client';

import styled from 'styled-components';
import { Check } from 'lucide-react';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import SectionHeading from '@/components/ui/SectionHeading';
import Icon from '@/components/ui/Icon';
import Button from '@/components/ui/Button';
import Reveal from '@/components/ui/Reveal';
import { reasons } from '@/data/content';
import { media } from '@/styles/theme';

const Layout = styled.div`
  display: grid;
  grid-template-columns: 0.9fr 1.1fr;
  gap: clamp(2.5rem, 6vw, 6rem);
  align-items: start;

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const Left = styled.div`
  position: sticky;
  top: 140px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.5rem;

  ${media.down('md')} {
    position: static;
  }
`;

const Principles = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  margin-top: 0.5rem;

  li {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    font-size: 0.85rem;
    color: ${({ theme }) => theme.colors.textSoft};
  }

  span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid ${({ theme }) => theme.colors.violetLine};
    background: ${({ theme }) => theme.colors.violetWash};
    color: ${({ theme }) => theme.colors.violetSoft};
  }
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const Row = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: 46px 1fr;
  gap: 1.35rem;
  padding: 1.6rem 0.5rem 1.6rem 0.25rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  transition: background-color 0.35s ease;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    background: ${({ theme }) => theme.gradients.accent};
    opacity: 0;
    transition: opacity 0.35s ease;
  }

  @media (hover: hover) {
    &:hover {
      background: linear-gradient(
        90deg,
        rgba(124, 92, 255, 0.07),
        rgba(124, 92, 255, 0.01) 60%,
        transparent
      );
    }

    &:hover::before {
      opacity: 1;
    }

    &:hover .reason-icon {
      color: ${({ theme }) => theme.colors.violetSoft};
      border-color: ${({ theme }) => theme.colors.violetLine};
      background: ${({ theme }) => theme.colors.violetWash};
    }
  }
`;

const ReasonIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: rgba(255, 255, 255, 0.025);
  color: ${({ theme }) => theme.colors.textSoft};
  transition:
    color 0.3s ease,
    border-color 0.3s ease,
    background-color 0.3s ease;
`;

const ReasonBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`;

const TopLine = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
`;

const ReasonTitle = styled.h3`
  font-size: clamp(1.05rem, 1.8vw, 1.22rem);
  letter-spacing: -0.025em;
  font-weight: 600;
`;

const Number = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  color: ${({ theme }) => theme.colors.faint};
`;

const ReasonText = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9rem;
  line-height: 1.68;
  max-width: 480px;
`;

export default function WhyChoose() {
  return (
    <Section $tone="soft" $divider id="why" aria-labelledby="why-heading">
      <Container>
        <Layout>
          <Left>
            <SectionHeading
              eyebrow="Why choose MK Group Digital"
              title={
                <>
                  Why Choose <em>Us.</em>
                </>
              }
              description="Six things we hold to on every project — whether it is a first website, a business system or an ongoing marketing partnership."
              headingId="why-heading"
            />
            <Principles>
              <li>
                <span>
                  <Check size={12} strokeWidth={2.4} />
                </span>
                Senior attention from brief to launch
              </li>
              <li>
                <span>
                  <Check size={12} strokeWidth={2.4} />
                </span>
                Clear milestones, no black boxes
              </li>
              <li>
                <span>
                  <Check size={12} strokeWidth={2.4} />
                </span>
                Support that continues after launch
              </li>
            </Principles>
            <Button href="/contact" variant="secondary">
              Start a conversation
            </Button>
          </Left>

          <List>
            {reasons.map((reason, index) => (
              <Reveal key={reason.title} delay={index * 0.05} y={18}>
                <Row>
                  <ReasonIcon className="reason-icon">
                    <Icon name={reason.icon} size={20} />
                  </ReasonIcon>
                  <ReasonBody>
                    <TopLine>
                      <ReasonTitle>{reason.title}</ReasonTitle>
                      <Number>{String(index + 1).padStart(2, '0')}</Number>
                    </TopLine>
                    <ReasonText>{reason.description}</ReasonText>
                  </ReasonBody>
                </Row>
              </Reveal>
            ))}
          </List>
        </Layout>
      </Container>
    </Section>
  );
}
