'use client';

import Image from 'next/image';
import Link from 'next/link';
import styled from 'styled-components';

const LogoLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  flex-shrink: 0;

  &:hover img {
    transform: rotate(-3deg) scale(1.03);
  }
`;

const Mark = styled.span`
  display: block;
  width: ${({ $size }) => ($size === 'lg' ? 72 : 52)}px;
  flex-shrink: 0;

  img {
    width: 100%;
    height: auto;
    transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  }
`;

const Words = styled.span`
  display: flex;
  flex-direction: column;
  line-height: 1;
  gap: 0.28rem;
`;

const Name = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: ${({ $size }) => ($size === 'lg' ? '1.02rem' : '0.87rem')};
  font-weight: 600;
  letter-spacing: 0.07em;
  color: ${({ theme }) => theme.colors.text};
`;

const Sub = styled.span`
  font-size: ${({ $size }) => ($size === 'lg' ? '0.62rem' : '0.56rem')};
  font-weight: 600;
  letter-spacing: 0.32em;
  color: ${({ theme }) => theme.colors.violetSoft};
`;

export default function BrandLogo({ size = 'md', priority = false, className }) {
  return (
    <LogoLink href="/" aria-label="MK Group Digital — home" className={className}>
      <Mark $size={size}>
        <Image
          src="/brand/mk-mark-light.png"
          alt=""
          width={144}
          height={75}
          priority={priority}
          sizes="80px"
        />
      </Mark>
      <Words>
        <Name $size={size}>MK GROUP</Name>
        <Sub $size={size}>DIGITAL</Sub>
      </Words>
    </LogoLink>
  );
}
