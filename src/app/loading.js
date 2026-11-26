'use client';

import styled from 'styled-components';
import Container from '@/components/ui/Container';

const Wrap = styled.div`
  padding-block: clamp(4rem, 9vw, 7rem);
`;

const Inner = styled(Container)`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Bar = styled.div`
  width: ${({ $w }) => $w || '100%'};
  height: ${({ $h }) => $h || '14px'};
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.045),
    rgba(255, 255, 255, 0.09),
    rgba(255, 255, 255, 0.045)
  );
  background-size: 200% 100%;

  @media (prefers-reduced-motion: no-preference) {
    animation: shimmer 1.4s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

const Block = styled.div`
  height: 220px;
  margin-top: 1.5rem;
  border-radius: 24px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: rgba(255, 255, 255, 0.02);
`;

const Skeleton = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  max-width: 680px;
`;

export default function Loading() {
  return (
    <Wrap role="status" aria-live="polite" aria-label="Loading page">
      <Inner>
        <Bar $w="120px" $h="10px" />
        <Skeleton>
          <Bar $w="80%" $h="clamp(2rem, 5vw, 3rem)" />
          <Bar $w="55%" $h="clamp(2rem, 5vw, 3rem)" />
        </Skeleton>
        <Skeleton style={{ marginTop: '1rem' }}>
          <Bar $w="min(560px, 100%)" />
          <Bar $w="min(480px, 100%)" />
        </Skeleton>
        <Block />
        <span
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
          }}
        >
          Loading page content…
        </span>
      </Inner>
    </Wrap>
  );
}
