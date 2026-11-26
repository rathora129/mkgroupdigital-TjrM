'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import styled from 'styled-components';
import Container from '@/components/ui/Container';
import { media } from '@/styles/theme';

const Wrap = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  min-height: min(780px, 80vh);
  padding-block: clamp(4rem, 10vw, 7rem);
  overflow: clip;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(620px circle at 50% 10%, rgba(124, 92, 255, 0.16), transparent 65%),
      radial-gradient(420px circle at 80% 90%, rgba(77, 141, 255, 0.08), transparent 65%);
    pointer-events: none;
  }
`;

const Inner = styled(Container)`
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1.25rem;
`;

const Code = styled.p`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: clamp(5rem, 18vw, 11rem);
  font-weight: 700;
  line-height: 0.82;
  letter-spacing: -0.07em;
  color: transparent;
  -webkit-text-stroke: 1px rgba(255, 255, 255, 0.16);
  background: ${({ theme }) => theme.gradients.text};
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  opacity: 0.9;
`;

const Eyebrow = styled.p`
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.violetSoft};
`;

const Title = styled.h1`
  font-size: clamp(1.9rem, 4.5vw, 3rem);
  letter-spacing: -0.04em;
  max-width: 620px;
`;

const Text = styled.p`
  max-width: 480px;
  font-size: 0.98rem;
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.muted};
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 0.75rem;

  ${media.down('sm')} {
    width: 100%;
    flex-direction: column;
  }
`;

const Action = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 50px;
  padding: 0.8rem 1.4rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.lineStrong};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.9rem;
  font-weight: 600;
  transition:
    border-color 0.3s ease,
    background 0.3s ease,
    transform 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    border-color: ${({ theme }) => theme.colors.violetLine};
    background: ${({ theme }) => theme.colors.violetWash};
  }

  ${({ $primary, theme }) =>
    $primary &&
    `
      border-color: transparent;
      background: linear-gradient(120deg, #9171ff 0%, #7048ff 52%, #4d8dff 100%);
      box-shadow: 0 18px 42px -20px rgba(124, 92, 255, 0.8);
      color: #fff;

      &:hover {
        border-color: transparent;
        background: linear-gradient(120deg, #9d82ff 0%, #7b55ff 52%, #5e98ff 100%);
      }
    `}
`;

const Suggestions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem 1.5rem;
  margin-top: 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid ${({ theme }) => theme.colors.line};

  a {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.78rem;
    color: ${({ theme }) => theme.colors.muted};
  }

  a:hover {
    color: ${({ theme }) => theme.colors.violetSoft};
  }
`;

export default function NotFound() {
  return (
    <Wrap>
      <Inner>
        <Code aria-hidden="true">404</Code>
        <Eyebrow>Page not found</Eyebrow>
        <Title>This page took a wrong turn.</Title>
        <Text>
          The link may be out of date, or the page may have moved. Let&apos;s get
          you back to something useful.
        </Text>
        <Actions>
          <Action href="/" $primary>
            <ArrowLeft size={16} /> Back to home
          </Action>
          <Action href="/contact">
            Start a project <ArrowUpRight size={15} />
          </Action>
        </Actions>
        <Suggestions aria-label="Suggested pages">
          <Link href="/services">Services</Link>
          <Link href="/work">Work</Link>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
        </Suggestions>
      </Inner>
    </Wrap>
  );
}
