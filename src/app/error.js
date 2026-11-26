'use client';

import Link from 'next/link';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import styled from 'styled-components';
import Container from '@/components/ui/Container';

const Wrap = styled.section`
  display: flex;
  align-items: center;
  min-height: min(720px, 76vh);
  padding-block: clamp(4rem, 10vw, 7rem);
`;

const Inner = styled(Container)`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1.15rem;
`;

const IconWrap = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.lineStrong};
  background: ${({ theme }) => theme.colors.violetWash};
  color: ${({ theme }) => theme.colors.violetSoft};
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
  max-width: 470px;
  font-size: 0.98rem;
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.muted};
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 0.6rem;

  button,
  a {
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
    font-family: ${({ theme }) => theme.fonts.body};
    cursor: pointer;
    transition:
      border-color 0.3s ease,
      background 0.3s ease,
      transform 0.3s ease;
  }

  button:hover,
  a:hover {
    transform: translateY(-2px);
    border-color: ${({ theme }) => theme.colors.violetLine};
    background: ${({ theme }) => theme.colors.violetWash};
  }
`;

export default function ErrorPage({ reset }) {
  return (
    <Wrap>
      <Inner>
        <IconWrap>
          <AlertTriangle size={26} strokeWidth={1.8} />
        </IconWrap>
        <Eyebrow>Something went wrong</Eyebrow>
        <Title>We hit a problem loading this page.</Title>
        <Text>
          It is usually temporary. Try again, or head back to the homepage if the
          problem continues.
        </Text>
        <Actions>
          <button type="button" onClick={() => reset()}>
            <RotateCcw size={16} /> Try again
          </button>
          <Link href="/">
            <Home size={16} /> Back to home
          </Link>
        </Actions>
      </Inner>
    </Wrap>
  );
}
