'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import styled from 'styled-components';
import Container from '@/components/ui/Container';
import { media } from '@/styles/theme';

const Section = styled.section`
  position: relative;
  padding-block: clamp(2rem, 4vw, 3.25rem) clamp(3rem, 6vw, 5rem);
  overflow: clip;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(720px circle at 18% -10%, rgba(124, 92, 255, 0.16), transparent 62%),
      radial-gradient(560px circle at 92% 115%, rgba(77, 141, 255, 0.09), transparent 65%);
    pointer-events: none;
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.026) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.026) 1px, transparent 1px);
    background-size: 72px 72px;
    mask-image: radial-gradient(70% 90% at 40% 0%, #000, transparent 80%);
    -webkit-mask-image: radial-gradient(70% 90% at 40% 0%, #000, transparent 80%);
    pointer-events: none;
  }
`;

const Inner = styled(Container)`
  position: relative;
  z-index: 2;
`;

const Breadcrumb = styled.nav`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: clamp(1.75rem, 4vw, 2.75rem);
  font-size: 0.74rem;
  color: ${({ theme }) => theme.colors.faint};

  a {
    color: ${({ theme }) => theme.colors.muted};
    transition: color 0.25s ease;

    &:hover {
      color: ${({ theme }) => theme.colors.text};
    }
  }

  span[aria-current='page'] {
    color: ${({ theme }) => theme.colors.textSoft};
  }

  svg {
    color: ${({ theme }) => theme.colors.faint};
    opacity: 0.7;
  }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: ${({ $withAside }) => ($withAside ? '1fr 320px' : '1fr')};
  gap: clamp(2rem, 6vw, 5rem);
  align-items: end;

  ${media.down('md')} {
    grid-template-columns: 1fr;
  }
`;

const Copy = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.2rem;
  max-width: ${({ $narrow }) => ($narrow ? '760px' : '900px')};
`;

const Eyebrow = styled.p`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.violetSoft};

  &::before {
    content: '';
    width: 24px;
    height: 1px;
    background: ${({ theme }) => theme.gradients.accent};
  }
`;

const Title = styled.h1`
  font-size: clamp(2.45rem, 5.3vw, 4.35rem);
  line-height: 1.02;
  letter-spacing: -0.045em;
  text-wrap: balance;

  em {
    font-style: normal;
    background: ${({ theme }) => theme.gradients.text};
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

const Description = styled.p`
  max-width: 620px;
  font-size: clamp(0.98rem, 1.6vw, 1.08rem);
  line-height: 1.72;
  color: ${({ theme }) => theme.colors.muted};
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  padding-top: 0.55rem;
`;

const Aside = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;

  ${media.down('md')} {
    display: none;
  }
`;

export default function PageHero({
  breadcrumb = [],
  eyebrow,
  title,
  description,
  actions,
  aside,
  narrow = false,
}) {
  return (
    <Section>
      <Inner>
        {breadcrumb.length ? (
          <Breadcrumb aria-label="Breadcrumb">
            {breadcrumb.map((crumb, index) => {
              const isLast = index === breadcrumb.length - 1;
              return (
                <span
                  key={`${crumb.name}-${index}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  {index > 0 ? <ChevronRight size={12} aria-hidden="true" /> : null}
                  {isLast || !crumb.path ? (
                    <span aria-current={isLast ? 'page' : undefined}>
                      {crumb.name}
                    </span>
                  ) : (
                    <Link href={crumb.path}>{crumb.name}</Link>
                  )}
                </span>
              );
            })}
          </Breadcrumb>
        ) : null}

        <Layout $withAside={Boolean(aside)}>
          <Copy $narrow={narrow}>
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <Title>{title}</Title>
            {description ? <Description>{description}</Description> : null}
            {actions ? <Actions>{actions}</Actions> : null}
          </Copy>
          {aside ? <Aside>{aside}</Aside> : null}
        </Layout>
      </Inner>
    </Section>
  );
}
