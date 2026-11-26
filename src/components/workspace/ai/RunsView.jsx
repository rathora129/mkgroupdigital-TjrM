'use client';

import Link from 'next/link';
import styled from 'styled-components';
import { workspaceMedia } from '@/styles/workspaceTheme';
import {
  formatCents,
  formatDateTime,
  formatDuration,
  formatTokens,
  statusMeta,
} from '@/lib/ai/format';
import {
  Actions,
  Badge,
  Card,
  CardHead,
  CardText,
  CardTitle,
  EmptyState,
  Eyebrow,
  Header,
  Hint,
  Lead,
  LinkButton,
  Page,
  Table,
  TableWrap,
  Title,
} from './primitives';

const Filters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Filter = styled(Link)`
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

const Pager = styled.div`
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

const FILTERS = [
  { key: null, label: 'All' },
  { key: 'awaiting_approval', label: 'Awaiting approval' },
  { key: 'queued', label: 'Queued' },
  { key: 'running', label: 'Running' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
];

function hrefFor(status, page) {
  const search = new URLSearchParams();
  if (status) search.set('status', status);
  if (page && page > 1) search.set('page', String(page));
  const query = search.toString();
  return query
    ? `/workspace/ai-workforce/runs?${query}`
    : '/workspace/ai-workforce/runs';
}

export default function RunsView({ runs, status, timezone }) {
  const { items, total, page, pages, pageSize } = runs;

  return (
    <Page>
      <Header>
        <Eyebrow>Agent runs</Eyebrow>
        <Title>Execution history</Title>
        <Lead>
          Every run records its input, status, execution logs, token usage and
          estimated cost. Provider calls run in the background worker, never
          inside a web request.
        </Lead>
      </Header>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Runs</CardTitle>
            <CardText>
              {total} {total === 1 ? 'run' : 'runs'} in this workspace. Showing
              page {page} of {pages}.
            </CardText>
          </div>
          <Actions>
            <LinkButton href="/workspace/ai-workforce">AI workforce</LinkButton>
          </Actions>
        </CardHead>

        <Filters>
          {FILTERS.map((filter) => (
            <Filter
              key={filter.key || 'all'}
              href={hrefFor(filter.key, 1)}
              $active={status === filter.key}
            >
              {filter.label}
            </Filter>
          ))}
        </Filters>

        {items.length === 0 ? (
          <EmptyState>
            <div>
              <h3>No runs match this filter</h3>
              <p>
                Start a run from an enabled agent. Runs appear here with their
                live status and recorded usage.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Requested by</th>
                  <th>Tokens</th>
                  <th>Cost</th>
                  <th>Duration</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((run) => {
                  const meta = statusMeta(run.status);
                  return (
                    <tr key={run.id}>
                      <td>
                        <Link href={`/workspace/ai-workforce/runs/${run.id}`}>
                          {run.agentName}
                        </Link>
                      </td>
                      <td>
                        <Badge $tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td>{run.requestedByName || run.requestedByEmail || '—'}</td>
                      <td>
                        {formatTokens(run.promptTokens + run.completionTokens)}
                      </td>
                      <td>{formatCents(run.costEstimateCents)}</td>
                      <td>{formatDuration(run.durationMs)}</td>
                      <td>{formatDateTime(run.createdAt, timezone)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}

        {pages > 1 ? (
          <Pager>
            <span>
              {pageSize} per page · {total} total
            </span>
            <Actions>
              {page > 1 ? (
                <LinkButton href={hrefFor(status, page - 1)}>Previous</LinkButton>
              ) : null}
              {page < pages ? (
                <LinkButton href={hrefFor(status, page + 1)}>Next</LinkButton>
              ) : null}
            </Actions>
          </Pager>
        ) : (
          <Hint>Runs are kept for review; cancel an open run from its detail page.</Hint>
        )}
      </Card>
    </Page>
  );
}
