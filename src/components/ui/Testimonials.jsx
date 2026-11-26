'use client';

import styled from 'styled-components';
import { Quote } from 'lucide-react';
import Button from './Button';
import { testimonialCopy } from '@/data/testimonials';
import { media } from '@/styles/theme';

const Shell = styled.div`
  display: grid;
  grid-template-columns: 0.95fr 1.05fr;
  gap: clamp(2rem, 5vw, 4rem);
  align-items: center;
  padding: clamp(1.75rem, 4vw, 3rem);
  border-radius: ${({ theme }) => theme.radius.xl};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background:
    radial-gradient(720px circle at 100% 0%, rgba(124, 92, 255, 0.12), transparent 60%),
    ${({ theme }) => theme.colors.bgRaised};

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const Copy = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.15rem;
`;

const QuoteMark = styled.span`
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

const Title = styled.h3`
  font-size: clamp(1.45rem, 3vw, 2.05rem);
  letter-spacing: -0.035em;
  line-height: 1.16;
  max-width: 430px;
`;

const Text = styled.p`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.96rem;
  line-height: 1.72;
  max-width: 460px;
`;

const Note = styled.p`
  font-size: 0.74rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.faint};
`;

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
`;

const Placeholder = styled.div`
  position: relative;
  padding: 1.25rem 1.35rem;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px dashed ${({ theme }) => theme.colors.lineStrong};
  background: rgba(255, 255, 255, 0.015);

  &:nth-child(2) {
    margin-left: 1.25rem;
  }

  &:nth-child(3) {
    margin-left: 2.5rem;
  }

  ${media.down('sm')} {
    &:nth-child(2),
    &:nth-child(3) {
      margin-left: 0;
    }
  }
`;

const Reserved = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.violetSoft};

  &::before {
    content: '';
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.violetSoft};
  }
`;

const Lines = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.85rem;

  span {
    display: block;
    height: 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
  }

  span:nth-child(1) {
    width: 92%;
  }
  span:nth-child(2) {
    width: 78%;
  }
  span:nth-child(3) {
    width: 46%;
  }
`;

const RealGrid = styled.div`
  display: grid;
  gap: 1rem;
`;

const RealCard = styled.figure`
  margin: 0;
  padding: 1.5rem;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.colors.card};

  blockquote {
    margin: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 0.95rem;
    line-height: 1.7;
  }

  figcaption {
    margin-top: 1rem;
    color: ${({ theme }) => theme.colors.muted};
    font-size: 0.78rem;
  }
`;

export default function Testimonials({ items = [] }) {
  if (items.length) {
    return (
      <RealGrid>
        {items.map((item) => (
          <RealCard key={item.name}>
            <blockquote>&ldquo;{item.quote}&rdquo;</blockquote>
            <figcaption>
              {item.name}
              {item.role ? ` — ${item.role}` : ''}
            </figcaption>
          </RealCard>
        ))}
      </RealGrid>
    );
  }

  return (
    <Shell>
      <Copy>
        <QuoteMark aria-hidden="true">
          <Quote size={20} strokeWidth={1.7} />
        </QuoteMark>
        <Title>{testimonialCopy.emptyTitle}</Title>
        <Text>{testimonialCopy.emptyText}</Text>
        <Button href="/work" variant="secondary" size="sm">
          See the live projects
        </Button>
        <Note>{testimonialCopy.note}</Note>
      </Copy>
      <Stack aria-label="Testimonial placeholders">
        {[0, 1, 2].map((index) => (
          <Placeholder key={index}>
            <Reserved>Reserved for a client story</Reserved>
            <Lines aria-hidden="true">
              <span />
              <span />
              <span />
            </Lines>
          </Placeholder>
        ))}
      </Stack>
    </Shell>
  );
}
