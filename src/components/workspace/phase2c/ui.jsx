'use client';

import Link from 'next/link';
import styled from 'styled-components';
import { workspaceMedia } from '@/styles/workspaceTheme';
import { Button, LinkButton } from '@/components/workspace/ai/primitives';

export const FilterBar = styled.form`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
`;

export const FilterField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  font-size: 0.72rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.muted};

  input,
  select {
    min-height: 36px;
    padding: 6px 10px;
    border-radius: 9px;
    border: 1px solid ${({ theme }) => theme.colors.borderStrong};
    background: ${({ theme }) => theme.colors.surfaceRaised};
    color: ${({ theme }) => theme.colors.text};
    font-size: 0.8rem;
    font-family: inherit;

    &:focus {
      outline: 2px solid ${({ theme }) => theme.colors.primaryBorder};
      outline-offset: 1px;
      border-color: ${({ theme }) => theme.colors.primary};
    }
  }

  input {
    min-width: 180px;
  }
`;

export const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

export const FilterChip = styled(Link)`
  display: inline-flex;
  align-items: center;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid
    ${({ theme, $active }) =>
      $active ? theme.colors.primary : theme.colors.border};
  background: ${({ theme, $active }) =>
    $active ? theme.colors.primarySoft : theme.colors.surfaceRaised};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.textSoft};
  font-size: 0.74rem;
  font-weight: 600;
  white-space: nowrap;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primaryBorder};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

export const Pager = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 0.78rem;
  color: ${({ theme }) => theme.colors.muted};

  ${workspaceMedia.down('xs')} {
    justify-content: center;
  }
`;

export const PagerActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const SmallButton = styled(Button)`
  min-height: 32px;
  padding: 0 10px;
  font-size: 0.74rem;
`;

export const SmallLink = styled(LinkButton)`
  min-height: 32px;
  padding: 0 10px;
  font-size: 0.74rem;
`;

export const MetaGrid = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px 18px;

  div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  dt {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.muted};
  }

  dd {
    margin: 0;
    font-size: 0.82rem;
    color: ${({ theme }) => theme.colors.textSoft};
    word-break: break-word;
  }

  a {
    color: ${({ theme }) => theme.colors.primary};
    font-weight: 600;

    &:hover {
      color: ${({ theme }) => theme.colors.primaryHover};
    }
  }
`;

export const Timeline = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 12px;
  list-style: none;
  margin: 0;
  padding: 0;
`;

export const TimelineItem = styled.li`
  position: relative;
  padding-left: 20px;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 5px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${({ theme, $tone }) =>
      $tone === 'success'
        ? theme.colors.success
        : $tone === 'danger'
          ? theme.colors.danger
          : $tone === 'warning'
            ? theme.colors.warning
            : theme.colors.primary};
  }

  &::after {
    content: '';
    position: absolute;
    left: 3px;
    top: 17px;
    bottom: -12px;
    width: 1px;
    background: ${({ theme }) => theme.colors.border};
  }

  &:last-child::after {
    display: none;
  }

  strong {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textSoft};
  }

  p {
    margin-top: 3px;
    font-size: 0.78rem;
    line-height: 1.55;
    color: ${({ theme }) => theme.colors.textSoft};
    white-space: pre-wrap;
    word-break: break-word;
  }

  span {
    display: block;
    margin-top: 4px;
    font-size: 0.7rem;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

export const TwoCol = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;

  ${workspaceMedia.down('md')} {
    grid-template-columns: 1fr;
  }
`;

export const Subhead = styled.h2`
  font-size: 0.86rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: ${({ theme }) => theme.colors.textSoft};
`;

export const LogList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    display: grid;
    grid-template-columns: 150px 62px minmax(0, 1fr);
    gap: 8px;
    align-items: baseline;
    padding-bottom: 8px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    font-size: 0.76rem;
  }

  li:last-child {
    border-bottom: 0;
  }

  time {
    color: ${({ theme }) => theme.colors.muted};
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 0.7rem;
  }

  em {
    font-style: normal;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 0.64rem;
    letter-spacing: 0.05em;
    color: ${({ theme }) => theme.colors.muted};
  }

  em[data-level='error'] {
    color: ${({ theme }) => theme.colors.danger};
  }

  em[data-level='warn'] {
    color: ${({ theme }) => theme.colors.warning};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    word-break: break-word;
  }

  ${workspaceMedia.down('md')} {
    li {
      grid-template-columns: 1fr;
      gap: 2px;
    }
  }
`;

export function ListPager({ page, pages, total, pageSize, hrefFor, note }) {
  if (pages <= 1) {
    return total > 0 ? (
      <Pager>
        <span>
          {total} {total === 1 ? 'record' : 'records'}
        </span>
        {note ? <span>{note}</span> : null}
      </Pager>
    ) : null;
  }

  return (
    <Pager>
      <span>
        Page {page} of {pages} · {pageSize} per page · {total} total
      </span>
      <PagerActions>
        {page > 1 ? (
          <SmallLink href={hrefFor(page - 1)}>Previous</SmallLink>
        ) : null}
        {page < pages ? <SmallLink href={hrefFor(page + 1)}>Next</SmallLink> : null}
      </PagerActions>
    </Pager>
  );
}
