'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import styled from 'styled-components';
import Icon from './Icon';
import { media } from '@/styles/theme';

const Card = styled(Link)`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.75rem 1.75rem 1.55rem;
  min-height: 100%;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: ${({ theme }) => theme.gradients.card};
  overflow: hidden;
  transition:
    transform 0.45s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.35s ease,
    background-color 0.35s ease;

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
    background-color: ${({ theme }) => theme.colors.cardHover};
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
  gap: 0.65rem;
  flex: 1;
`;

const Title = styled.h3`
  font-size: clamp(1.12rem, 2vw, 1.32rem);
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.2;
`;

const Copy = styled.p`
  font-size: 0.91rem;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.muted};
`;

const Learn = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 1.15rem;
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

  ${media.down('md')} {
    width: 32px;
    height: 32px;
  }
`;

export default function ServiceCard({ service, index }) {
  return (
    <Card href={`/services/${service.slug}`}>
      <Top>
        <IconBadge className="card-icon">
          <Icon name={service.icon} size={22} />
        </IconBadge>
        <Index>{String(index + 1).padStart(2, '0')}</Index>
      </Top>
      <Body>
        <Title>{service.title}</Title>
        <Copy>{service.short}</Copy>
        <Learn>
          <span>Learn more</span>
          <Arrow className="card-arrow" aria-hidden="true">
            <ArrowUpRight size={16} strokeWidth={1.9} />
          </Arrow>
        </Learn>
      </Body>
    </Card>
  );
}
