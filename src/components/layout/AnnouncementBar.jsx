'use client';

import styled from 'styled-components';
import { Sparkles } from 'lucide-react';
import { media } from '@/styles/theme';

const Bar = styled.div`
  position: relative;
  z-index: 101;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  min-height: 36px;
  padding: 0.45rem ${({ theme }) => theme.spacing.gutter};
  background:
    linear-gradient(90deg, rgba(124, 92, 255, 0.14), rgba(77, 141, 255, 0.1)),
    ${({ theme }) => theme.colors.bgRaised};
  border-bottom: 1px solid ${({ theme }) => theme.colors.lineSoft};
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.76rem;
  letter-spacing: 0.015em;
  text-align: center;

  svg {
    color: ${({ theme }) => theme.colors.violetSoft};
    flex-shrink: 0;
  }

  ${media.down('sm')} {
    font-size: 0.69rem;
    min-height: 32px;
  }
`;

const Dot = styled.span`
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.violetSoft};
  box-shadow: 0 0 0 4px rgba(124, 92, 255, 0.12);
  animation: pulse 3s ease-in-out infinite;

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }
`;

export default function AnnouncementBar() {
  return (
    <Bar>
      <Sparkles size={13} strokeWidth={1.8} aria-hidden="true" />
      <span>Helping ambitious brands grow digitally — India &amp; Worldwide</span>
      <Dot aria-hidden="true" />
    </Bar>
  );
}
