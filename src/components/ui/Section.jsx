'use client';

import styled, { css } from 'styled-components';
import { media } from '@/styles/theme';

const Section = styled.section`
  position: relative;
  padding-block: ${({ theme, $compact }) =>
    $compact ? theme.spacing.sectionSm : theme.spacing.section};
  overflow: clip;

  ${({ $tone, theme }) =>
    $tone === 'soft' &&
    css`
      background: ${theme.colors.bgSoft};
    `}

  ${({ $tone, theme }) =>
    $tone === 'raised' &&
    css`
      background: linear-gradient(180deg, ${theme.colors.bg} 0%, ${theme.colors.bgRaised} 50%, ${theme.colors.bg} 100%);
    `}

  ${({ $divider, theme }) =>
    $divider &&
    css`
      border-top: 1px solid ${theme.colors.line};
    `}

  ${media.down('md')} {
    padding-block: ${({ theme, $compact }) =>
      $compact ? 'clamp(3rem, 10vw, 4.5rem)' : 'clamp(4.25rem, 14vw, 6.5rem)'};
  }
`;

export default Section;
