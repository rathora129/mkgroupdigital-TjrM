'use client';

import Link from 'next/link';
import { AlertTriangle, LayoutDashboard, RotateCcw } from 'lucide-react';
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
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.warningSoft};
  color: ${({ theme }) => theme.colors.warning};
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

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;

  a,
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 14px;
    border-radius: ${({ theme }) => theme.radius.md};
    font-size: 0.8rem;
    font-weight: 600;
  }
`;

const PrimaryAction = styled.button`
  background: ${({ theme }) => theme.colors.primary};
  color: #FFFFFF;

  &:hover {
    background: ${({ theme }) => theme.colors.primaryHover};
  }
`;

const SecondaryAction = styled(Link)`
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.surfaceRaised};
  color: ${({ theme }) => theme.colors.textSoft};

  &:hover {
    border-color: ${({ theme }) => theme.colors.primaryBorder};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

export default function WorkspaceError({ reset }) {
  return (
    <Wrap role="alert">
      <IconChip>
        <AlertTriangle size={19} strokeWidth={1.8} aria-hidden="true" />
      </IconChip>
      <Title>This workspace page could not load.</Title>
      <Text>
        Nothing was saved or changed. Try again, or return to the overview to
        continue from a known state.
      </Text>
      <Actions>
        <PrimaryAction type="button" onClick={() => reset()}>
          <RotateCcw size={15} aria-hidden="true" /> Try again
        </PrimaryAction>
        <SecondaryAction href="/workspace">
          <LayoutDashboard size={15} aria-hidden="true" /> Back to overview
        </SecondaryAction>
      </Actions>
    </Wrap>
  );
}
