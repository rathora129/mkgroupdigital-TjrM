'use client';

import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import styled from 'styled-components';
import { workspaceMedia } from '@/styles/workspaceTheme';
import {
  AUDIT_RESOURCE_OPTIONS,
  formatAuditAction,
  formatResourceType,
} from '@/lib/audit-labels';

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 1120px;
`;

const Header = styled.header`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Eyebrow = styled.p`
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.primary};
`;

const Title = styled.h1`
  font-size: clamp(1.5rem, 3vw, 1.9rem);
  letter-spacing: -0.025em;
`;

const Lead = styled.p`
  max-width: 680px;
  font-size: 0.88rem;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.muted};
`;

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: clamp(18px, 3vw, 24px);
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surfaceRaised};
  box-shadow: ${({ theme }) => theme.shadow.card};
`;

const FilterForm = styled.form`
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;

  ${workspaceMedia.down('md')} {
    grid-template-columns: 1fr 1fr;
  }

  ${workspaceMedia.down('sm')} {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

const Label = styled.label`
  font-size: 0.72rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSoft};
`;

const Input = styled.input`
  min-height: 38px;
  padding: 0 11px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.bg};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.82rem;
`;

const Select = styled.select`
  min-height: 38px;
  padding: 0 10px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.bg};
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.82rem;
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  ${workspaceMedia.down('md')} {
    grid-column: 1 / -1;
  }
`;

const PrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 16px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  font-size: 0.8rem;
  font-weight: 600;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primaryHover};
  }

  &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
`;

const GhostButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 34px;
  padding: 0 11px;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.bg};
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.74rem;
  font-weight: 600;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primaryBorder};
    color: ${({ theme }) => theme.colors.primary};
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const ErrorNotice = styled.p`
  padding: 10px 13px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.danger};
  background: ${({ theme }) => theme.colors.dangerSoft};
  color: ${({ theme }) => theme.colors.danger};
  font-size: 0.8rem;
`;

const TableWrap = styled.div`
  overflow-x: auto;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const Table = styled.table`
  width: 100%;
  min-width: 780px;
  border-collapse: collapse;
  font-size: 0.78rem;

  th {
    padding: 10px 10px;
    text-align: left;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.muted};
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    white-space: nowrap;
  }

  td {
    padding: 11px 10px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    vertical-align: top;
    color: ${({ theme }) => theme.colors.textSoft};
  }

  tr:last-child td {
    border-bottom: 0;
  }
`;

const TimeCell = styled.td`
  white-space: nowrap;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.74rem;
`;

const Mono = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const Outcome = styled.span`
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid
    ${({ theme, $success }) =>
      $success ? theme.colors.success : theme.colors.danger};
  background: ${({ theme, $success }) =>
    $success ? theme.colors.successSoft : theme.colors.dangerSoft};
  color: ${({ theme, $success }) =>
    $success ? theme.colors.success : theme.colors.danger};
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

const Details = styled.details`
  summary {
    cursor: pointer;
    color: ${({ theme }) => theme.colors.primary};
    font-size: 0.72rem;
    font-weight: 600;
  }

  pre {
    margin: 8px 0 0;
    padding: 8px 10px;
    border-radius: ${({ theme }) => theme.radius.sm};
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.textSoft};
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 0.7rem;
    white-space: pre-wrap;
    word-break: break-word;
    max-width: 320px;
  }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 0.76rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const Empty = styled.p`
  padding: 18px 2px 6px;
  font-size: 0.82rem;
  color: ${({ theme }) => theme.colors.muted};
`;

function formatDateTime(value, timeZone) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZone: timeZone || undefined,
    }).format(new Date(value));
  } catch {
    return '—';
  }
}

function actorLabel(entry) {
  if (entry.actorName) return entry.actorName;
  if (entry.actorEmail) return entry.actorEmail;
  if (entry.actorType === 'anonymous') return 'Anonymous';
  return 'System';
}

async function fetchAudit(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, value);
    }
  }

  const response = await fetch(`/api/workforce/audit?${search.toString()}`, {
    headers: { Accept: 'application/json' },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.error?.message || 'The audit log could not be loaded.',
    );
  }

  return payload.data;
}

const EMPTY_FILTERS = {
  action: '',
  resourceType: '',
  actor: '',
  success: '',
};

export default function AuditLogView({ timezone }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    fetchAudit({ ...applied, page, pageSize: 25 })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applied, page]);

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function beginRequest() {
    setLoading(true);
    setError(null);
  }

  function applyFilters(event) {
    event.preventDefault();
    beginRequest();
    setPage(1);
    setApplied({ ...filters });
  }

  function resetFilters() {
    beginRequest();
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  function goToPage(next) {
    beginRequest();
    setPage(next);
  }

  const items = data?.items || [];
  const pages = data?.pages || 1;

  return (
    <Page>
      <Header>
        <Eyebrow>Phase 2A · Foundations</Eyebrow>
        <Title>Audit log</Title>
        <Lead>
          Workspace-scoped record of authentication, invitation, membership,
          workspace and module events. Sensitive values are removed
          before an entry is stored.
        </Lead>
      </Header>

      <Panel>
        <FilterForm onSubmit={applyFilters}>
          <Field>
            <Label htmlFor="audit-action">Action contains</Label>
            <Input
              id="audit-action"
              value={filters.action}
              maxLength={80}
              placeholder="membership"
              onChange={(event) => setFilter('action', event.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="audit-resource">Resource</Label>
            <Select
              id="audit-resource"
              value={filters.resourceType}
              onChange={(event) =>
                setFilter('resourceType', event.target.value)
              }
            >
              <option value="">All resources</option>
              {AUDIT_RESOURCE_OPTIONS.map((resource) => (
                <option key={resource} value={resource}>
                  {formatResourceType(resource)}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="audit-actor">Actor</Label>
            <Input
              id="audit-actor"
              value={filters.actor}
              maxLength={254}
              placeholder="Name or email"
              onChange={(event) => setFilter('actor', event.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="audit-outcome">Outcome</Label>
            <Select
              id="audit-outcome"
              value={filters.success}
              onChange={(event) => setFilter('success', event.target.value)}
            >
              <option value="">All outcomes</option>
              <option value="true">Succeeded</option>
              <option value="false">Failed</option>
            </Select>
          </Field>
          <Actions>
            <PrimaryButton type="submit" disabled={loading}>
              <Search size={14} aria-hidden="true" /> Apply
            </PrimaryButton>
            <GhostButton type="button" onClick={resetFilters} disabled={loading}>
              <RotateCcw size={13} aria-hidden="true" /> Reset
            </GhostButton>
          </Actions>
        </FilterForm>

        {error ? <ErrorNotice role="alert">{error}</ErrorNotice> : null}

        {loading && !data ? (
          <Empty>
            <Loader2 size={14} className="spin" aria-hidden="true" /> Loading
            audit events…
          </Empty>
        ) : null}

        {!loading && items.length === 0 ? (
          <Empty>No audit events match these filters.</Empty>
        ) : null}

        {items.length ? (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Resource</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr key={entry.id}>
                    <TimeCell>{formatDateTime(entry.createdAt, timezone)}</TimeCell>
                    <td>
                      {actorLabel(entry)}
                      {entry.actorEmail && entry.actorName ? (
                        <>
                          <br />
                          <Mono>{entry.actorEmail}</Mono>
                        </>
                      ) : null}
                    </td>
                    <td>{formatAuditAction(entry.action)}</td>
                    <td>
                      {formatResourceType(entry.resourceType)}
                      {entry.resourceId ? (
                        <>
                          <br />
                          <Mono title={entry.resourceId}>
                            {entry.resourceId.slice(0, 8)}…
                          </Mono>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <Outcome $success={entry.success !== false}>
                        {entry.success === false ? 'Failed' : 'OK'}
                      </Outcome>
                    </td>
                    <td>
                      {entry.metadata ? (
                        <Details>
                          <summary>View</summary>
                          <pre>{JSON.stringify(entry.metadata, null, 2)}</pre>
                        </Details>
                      ) : (
                        <Mono>—</Mono>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        ) : null}

        <Footer>
          <span>
            <ShieldCheck size={13} aria-hidden="true" />{' '}
            {data ? `${data.total} events` : '—'} · page {page} of {pages}
          </span>
          <Actions>
            <GhostButton
              type="button"
              disabled={loading || page <= 1}
              onClick={() => goToPage(Math.max(1, page - 1))}
            >
              <ChevronLeft size={13} aria-hidden="true" /> Previous
            </GhostButton>
            <GhostButton
              type="button"
              disabled={loading || page >= pages}
              onClick={() => goToPage(Math.min(pages, page + 1))}
            >
              Next <ChevronRight size={13} aria-hidden="true" />
            </GhostButton>
          </Actions>
        </Footer>
      </Panel>
    </Page>
  );
}
