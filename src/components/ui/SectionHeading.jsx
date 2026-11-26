'use client';

import styled, { css } from 'styled-components';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
  max-width: ${({ $maxWidth }) => $maxWidth || '760px'};

  ${({ $align }) =>
    $align === 'center' &&
    css`
      align-items: center;
      text-align: center;
      margin-inline: auto;
    `}
`;

const Eyebrow = styled.p`
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.violetSoft};

  &::before {
    content: '';
    width: 26px;
    height: 1px;
    background: ${({ theme }) => theme.gradients.accent};
  }
`;

const Title = styled.h2`
  font-size: clamp(2.1rem, 4.6vw, 3.6rem);
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.04;

  em {
    font-style: normal;
    background: ${({ theme }) => theme.gradients.text};
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

const Description = styled.p`
  font-size: clamp(1rem, 1.5vw, 1.1rem);
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.muted};
  max-width: 640px;
`;

export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  maxWidth,
  as = 'h2',
  headingId,
  className,
}) {
  return (
    <Wrap $align={align} $maxWidth={maxWidth} className={className}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Title as={as} id={headingId}>
        {title}
      </Title>
      {description ? <Description>{description}</Description> : null}
    </Wrap>
  );
}
