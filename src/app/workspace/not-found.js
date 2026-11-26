'use client';

import Link from 'next/link';
import { ArrowLeft, Compass } from 'lucide-react';
import styled from 'styled-components';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  max-width: 560px;
  padding: clamp(24px, 4vw, 36px);
  border-radius: ${({ theme }) => theme.radius.xl};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surfaceRaised};
  box-shadow: ${({ theme }) => theme.shadow.card};
`;

const IconChip = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.primaryBorder};
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
`;

const Eyebrow = styled.p`
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
`;

const Title = styled.h1`
  font-size: clamp(1.3rem, 3vw, 1.6rem);
  letter-spacing: -0.025em;
`;

const Text = styled.p`
  font-size: 0.86rem;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.muted};
`;

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  min-height: 38px;
  padding: 0 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #FFFFFF;
  font-size: 0.8rem;
  font-weight: 600;

  &:hover {
    background: ${({ theme }) => theme.colors.primaryHover};
  }
`;

export default function WorkspaceNotFound() {
  return (
    <Wrap>
      <IconChip>
        <Compass size={19} strokeWidth={1.8} aria-hidden="true" />
      </IconChip>
      <Eyebrow>404 · Workspace</Eyebrow>
      <Title>That workspace page does not exist.</Title>
      <Text>
        The section you followed is not part of this phase. No data was changed.
      </Text>
      <BackLink href="/workspace">
        <ArrowLeft size={15} aria-hidden="true" /> Back to overview
      </BackLink>
    </Wrap>
  );
}
