'use client';

import styled, { css } from 'styled-components';

const widths = {
  base: '1240px',
  wide: '1420px',
  narrow: '880px',
  prose: '740px',
};

const Container = styled.div`
  width: 100%;
  margin-inline: auto;
  padding-inline: ${({ theme }) => theme.spacing.gutter};
  max-width: ${({ $width }) => widths[$width] || widths.base};

  ${({ $bleed, theme }) =>
    $bleed &&
    css`
      padding-inline: 0;
      max-width: 100%;
    `}
`;

export default Container;
