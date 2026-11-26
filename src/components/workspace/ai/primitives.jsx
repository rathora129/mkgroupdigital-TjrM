'use client';

import Link from 'next/link';
import styled, { css } from 'styled-components';
import { workspaceMedia } from '@/styles/workspaceTheme';

export const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: 22px;
  max-width: 1180px;
`;

export const Header = styled.header`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const Eyebrow = styled.p`
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.primary};
`;

export const Title = styled.h1`
  font-size: clamp(1.5rem, 3vw, 1.9rem);
  letter-spacing: -0.025em;
`;

export const Lead = styled.p`
  max-width: 720px;
  font-size: 0.88rem;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.muted};
`;

export const Card = styled.section`
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 16px;
  padding: clamp(16px, 2.4vw, 22px);
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surfaceRaised};
  box-shadow: ${({ theme }) => theme.shadow.card};
`;

export const CardHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

export const CardTitle = styled.h2`
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: -0.01em;
`;

export const CardText = styled.p`
  margin-top: 4px;
  font-size: 0.8rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.muted};
`;

export const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

export const Button = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.surfaceRaised};
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primaryBorder};
    color: ${({ theme }) => theme.colors.primary};
    background: ${({ theme }) => theme.colors.primarySoft};
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  ${({ $variant, theme }) =>
    $variant === 'primary'
      ? `border-color: ${theme.colors.primary}; background: ${theme.colors.primary}; color: #FFFFFF;
         &:hover:not(:disabled) { background: ${theme.colors.primaryHover}; color: #FFFFFF; border-color: ${theme.colors.primaryHover}; }`
      : ''}

  ${({ $variant, theme }) =>
    $variant === 'danger'
      ? `border-color: ${theme.colors.danger}; color: ${theme.colors.danger};
         &:hover:not(:disabled) { background: ${theme.colors.dangerSoft}; border-color: ${theme.colors.danger}; color: ${theme.colors.danger}; }`
      : ''}

  ${({ $variant, theme }) =>
    $variant === 'ghost'
      ? `border-color: transparent; background: transparent; color: ${theme.colors.muted};`
      : ''}
`;

export const LinkButton = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme, $primary }) =>
    $primary ? theme.colors.primary : theme.colors.borderStrong};
  background: ${({ theme, $primary }) =>
    $primary ? theme.colors.primary : theme.colors.surfaceRaised};
  color: ${({ theme, $primary }) =>
    $primary ? '#FFFFFF' : theme.colors.textSoft};
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;

  &:hover {
    border-color: ${({ theme, $primary }) =>
      $primary ? theme.colors.primaryHover : theme.colors.primaryBorder};
    background: ${({ theme, $primary }) =>
      $primary ? theme.colors.primaryHover : theme.colors.primarySoft};
    color: ${({ theme, $primary }) =>
      $primary ? '#FFFFFF' : theme.colors.primary};
  }
`;

export const Notice = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid
    ${({ theme, $tone }) =>
      $tone === 'danger'
        ? theme.colors.danger
        : $tone === 'success'
          ? theme.colors.success
          : $tone === 'warning'
            ? theme.colors.warning
            : theme.colors.primaryBorder};
  background: ${({ theme, $tone }) =>
    $tone === 'danger'
      ? theme.colors.dangerSoft
      : $tone === 'success'
        ? theme.colors.successSoft
        : $tone === 'warning'
          ? theme.colors.warningSoft
          : theme.colors.primarySoft};
  color: ${({ theme, $tone }) =>
    $tone === 'danger'
      ? theme.colors.danger
      : $tone === 'success'
        ? theme.colors.success
        : $tone === 'warning'
          ? theme.colors.warning
          : theme.colors.primary};
  font-size: 0.8rem;
  line-height: 1.55;
  word-break: break-word;

  svg {
    flex-shrink: 0;
    margin-top: 1px;
  }
`;

const badgeTones = (theme, $tone) => {
  if ($tone === 'success') {
    return `border-color: ${theme.colors.success}; background: ${theme.colors.successSoft}; color: ${theme.colors.success};`;
  }
  if ($tone === 'warning') {
    return `border-color: ${theme.colors.warning}; background: ${theme.colors.warningSoft}; color: ${theme.colors.warning};`;
  }
  if ($tone === 'danger') {
    return `border-color: ${theme.colors.danger}; background: ${theme.colors.dangerSoft}; color: ${theme.colors.danger};`;
  }
  if ($tone === 'muted') {
    return `border-color: ${theme.colors.border}; background: ${theme.colors.surface}; color: ${theme.colors.muted};`;
  }
  return `border-color: ${theme.colors.primaryBorder}; background: ${theme.colors.primarySoft}; color: ${theme.colors.primary};`;
};

export const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  ${({ theme, $tone }) => badgeTones(theme, $tone)}
`;

export const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;

  ${workspaceMedia.down('md')} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  ${workspaceMedia.down('xs')} {
    grid-template-columns: 1fr;
  }
`;

export const StatCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 15px;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surfaceRaised};
  box-shadow: ${({ theme }) => theme.shadow.card};
`;

export const StatLabel = styled.p`
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
`;

export const StatValue = styled.p`
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.colors.text};
`;

export const StatNote = styled.p`
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.muted};
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols || 2}, minmax(0, 1fr));
  gap: 14px;

  ${workspaceMedia.down('md')} {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ $gap }) => `${$gap || 12}px`};
`;

export const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
`;

export const Label = styled.span`
  font-size: 0.76rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSoft};
`;

const fieldStyles = css`
  width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.surfaceRaised};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.82rem;
  font-family: inherit;

  &:focus {
    outline: 2px solid ${({ theme }) => theme.colors.primaryBorder};
    outline-offset: 1px;
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.muted};
  }
`;

export const Input = styled.input`
  ${fieldStyles}
`;

export const Select = styled.select`
  ${fieldStyles}
`;

export const Textarea = styled.textarea`
  ${fieldStyles}
  min-height: 110px;
  resize: vertical;
  line-height: 1.55;
`;

export const Hint = styled.span`
  font-size: 0.72rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.muted};
`;

export const ErrorText = styled.span`
  font-size: 0.74rem;
  color: ${({ theme }) => theme.colors.danger};
`;

export const CheckLabel = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.8rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.textSoft};
  cursor: pointer;

  input {
    margin-top: 3px;
    accent-color: ${({ theme }) => theme.colors.primary};
  }
`;

export const CheckGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px 14px;
`;

export const EmptyState = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px dashed ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.surface};

  h3 {
    font-size: 0.84rem;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textSoft};
  }

  p {
    margin-top: 4px;
    font-size: 0.78rem;
    line-height: 1.6;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

export const TableWrap = styled.div`
  min-width: 0;
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
`;

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;

  th {
    padding: 9px 12px;
    text-align: left;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.muted};
    background: ${({ theme }) => theme.colors.surface};
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    white-space: nowrap;
  }

  td {
    padding: 10px 12px;
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.textSoft};
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    vertical-align: top;
  }

  tr:last-child td {
    border-bottom: 0;
  }

  a {
    color: ${({ theme }) => theme.colors.primary};
    font-weight: 600;
  }

  a:hover {
    color: ${({ theme }) => theme.colors.primaryHover};
  }
`;

export const Mono = styled.code`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.74rem;
  color: ${({ theme }) => theme.colors.textSoft};
  word-break: break-word;
`;

export const Pre = styled.pre`
  margin: 0;
  padding: 12px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.76rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textSoft};
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 340px;
  overflow-y: auto;
`;

export const Divider = styled.hr`
  border: 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  margin: 0;
`;
