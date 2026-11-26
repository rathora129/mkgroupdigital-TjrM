'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import styled, { css } from 'styled-components';

const variants = {
  primary: css`
    color: #fff;
    background: linear-gradient(120deg, #9171ff 0%, #7048ff 52%, #4d8dff 100%);
    box-shadow: 0 18px 42px -20px rgba(124, 92, 255, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.14);

    &::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(110deg, transparent 20%, rgba(255, 255, 255, 0.28) 48%, transparent 70%);
      transform: translateX(-120%);
      transition: transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
    }

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 24px 50px -20px rgba(124, 92, 255, 0.9);
    }

    &:hover::after {
      transform: translateX(120%);
    }
  `,
  secondary: css`
    color: ${({ theme }) => theme.colors.text};
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid ${({ theme }) => theme.colors.lineStrong};
    backdrop-filter: blur(12px);

    &:hover {
      transform: translateY(-2px);
      border-color: ${({ theme }) => theme.colors.violetLine};
      background: ${({ theme }) => theme.colors.violetWash};
    }
  `,
  light: css`
    color: #0a0a11;
    background: #f7f7fb;
    border: 1px solid rgba(255, 255, 255, 0.3);

    &:hover {
      transform: translateY(-2px);
      background: #ffffff;
    }
  `,
  ghost: css`
    padding-inline: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    border: 0;
    border-radius: 0;
    background: none;

    &:hover {
      color: ${({ theme }) => theme.colors.text};
    }

    &::before {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: -3px;
      height: 1px;
      background: ${({ theme }) => theme.colors.lineStrong};
      transform-origin: left;
      transition: transform 0.35s ease;
    }

    &:hover::before {
      background: ${({ theme }) => theme.colors.violet};
      transform: scaleX(1.04);
    }
  `,
};

const sizes = {
  sm: css`
    min-height: 42px;
    padding: 0.6rem 1.15rem;
    font-size: 0.86rem;
  `,
  md: css`
    min-height: 50px;
    padding: 0.8rem 1.5rem;
    font-size: 0.94rem;
  `,
  lg: css`
    min-height: 56px;
    padding: 1rem 1.9rem;
    font-size: 1rem;
  `,
};

const StyledButton = styled.button`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  overflow: hidden;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-family: ${({ theme }) => theme.fonts.body};
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.01em;
  white-space: nowrap;
  cursor: pointer;
  transition:
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    background-color 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.35s ease,
    color 0.3s ease;

  ${({ $size }) => sizes[$size] || sizes.md};
  ${({ $variant }) => variants[$variant] || variants.primary};

  ${({ $full }) =>
    $full &&
    css`
      width: 100%;
    `}

  > span {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
  }

  .btn-icon {
    position: relative;
    z-index: 1;
    display: inline-flex;
    transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
  }

  &:hover .btn-icon {
    transform: translate(2px, -2px);
  }

  &:active {
    transform: translateY(0) scale(0.99);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
  }
`;

export default function Button({
  children,
  href,
  external = false,
  variant = 'primary',
  size = 'md',
  full = false,
  icon = null,
  arrow = true,
  className,
  ...rest
}) {
  const content = (
    <>
      {icon ? <span className="btn-icon">{icon}</span> : null}
      <span>{children}</span>
      {arrow ? (
        <span className="btn-icon" aria-hidden="true">
          <ArrowUpRight size={17} strokeWidth={2.1} />
        </span>
      ) : null}
    </>
  );

  const shared = {
    className,
    $variant: variant,
    $size: size,
    $full: full,
  };

  if (href) {
    if (external) {
      return (
        <StyledButton
          as="a"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          {...shared}
          {...rest}
        >
          {content}
        </StyledButton>
      );
    }

    return (
      <StyledButton as={Link} href={href} {...shared} {...rest}>
        {content}
      </StyledButton>
    );
  }

  return (
    <StyledButton {...shared} {...rest}>
      {content}
    </StyledButton>
  );
}
