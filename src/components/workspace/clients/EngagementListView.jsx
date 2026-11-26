'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  Loader2,
  Pencil,
  Plus,
  Search,
} from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import { formatDate } from '@/lib/ai/format';
import {
  Actions,
  Badge,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  EmptyState,
  Eyebrow,
  Header,
  Hint,
  Lead,
  Page,
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Table,
  TableWrap,
  Title,
} from '@/components/workspace/ai/primitives';
import {
  FilterBar,
  FilterChip,
  FilterField,
  ListPager,
} from '@/components/workspace/phase2c/ui';
import { formatMoney } from '@/components/workspace/proposals/meta';
import { ENGAGEMENT_STATUS_TRANSITIONS } from '@/lib/clients/transitions';
import {
  ENGAGEMENT_FREQUENCY_LABELS,
  ENGAGEMENT_STATUS_META,
  metaFor,
  renewalLabel,
} from './meta';
import EngagementForm from './EngagementForm';

const STATUS_ORDER = ['planned', 'active', 'paused', 'ending', 'ended', 'cancelled'];
const LIST_KEYS = ['search', 'clientId', 'status', 'frequency', 'renewal', 'page'];

function listHref(query, overrides = {}) {
  const merged = { ...query, page: 1, ...overrides };
  const search = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = merged[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text
    ? `/workspace/clients/engagements?${text}`
    : '/workspace/clients/engagements';
}

function StatusControl({ engagement, canEdit, onChanged }) {
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const allowed = ENGAGEMENT_STATUS_TRANSITIONS[engagement.status] || [];

  if (!canEdit || allowed.length === 0) {
    return <span style={{ color: '#64748B' }}>—</span>;
  }

  async function apply() {
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/workforce/engagements/${engagement.id}/status`, {
        method: 'POST',
        body: { status: next, note: null },
      });
      setNext('');
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <select
          value={next}
          onChange={(event) => setNext(event.target.value)}
          disabled={busy}
          style={{ minHeight: 30, fontSize: '0.76rem' }}
        >
          <option value="">Change…</option>
          {allowed.map((status) => (
            <option key={status} value={status}>
              {ENGAGEMENT_STATUS_META[status]?.label || status}
            </option>
          ))}
        </select>
        <Button type="button" onClick={apply} disabled={busy || !next}>
          {busy ? <Loader2 size={12} className="spin" /> : 'Apply'}
        </Button>
      </div>
      {error ? <span style={{ color: '#B91C1C', fontSize: '0.7rem' }}>{error}</span> : null}
    </div>
  );
}

export default function EngagementListView({
  engagements,
  overview,
  clients,
  linkOptions,
  members,
  query,
  canCreate,
  canEdit,
  timezone,
}) {
  const router = useRouter();
  const { items, total, page, pages, pageSize } = engagements;
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState(null);

  function submitFilters(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const overrides = {};
    for (const key of LIST_KEYS) {
      if (key === 'page') continue;
      const value = String(data.get(key) ?? '').trim();
      overrides[key] = value || undefined;
    }
    router.push(listHref(overrides));
  }

  return (
    <Page>
      <Header>
        <Eyebrow>
          <Link href="/workspace/clients">Clients</Link> · Service engagements
        </Eyebrow>
        <Title>Ongoing service engagements</Title>
        <Lead>
          Pair a catalogue service with the client, proposal and delivery project
          that support it. Recurring service is an option, not the default.
        </Lead>
      </Header>

      <StatGrid>
        <StatCard>
          <StatLabel>Active engagements</StatLabel>
          <StatValue>{overview.active}</StatValue>
          <StatNote>{overview.planned} planned · {overview.paused} paused</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Renewals in 30 days</StatLabel>
          <StatValue>{overview.renewals30}</StatValue>
          <StatNote>{overview.renewals90} within 90 days</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Ending</StatLabel>
          <StatValue>{overview.ending}</StatValue>
          <StatNote>Winding down but not yet ended</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Total</StatLabel>
          <StatValue>{overview.total}</StatValue>
          <StatNote>{overview.ended} ended · {overview.cancelled} cancelled</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Engagements</CardTitle>
            <CardText>
              {total} {total === 1 ? 'engagement' : 'engagements'} match the
              current filters.
            </CardText>
          </div>
          <Actions>
            {canCreate ? (
              <Button
                type="button"
                $variant="primary"
                onClick={() => {
                  setEditing(null);
                  setCreating((current) => !current);
                }}
              >
                <Plus size={14} />
                New engagement
              </Button>
            ) : null}
          </Actions>
        </CardHead>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <FilterChip href={listHref(query, { status: undefined })} $active={!query.status}>
            All statuses
          </FilterChip>
          {STATUS_ORDER.map((status) => (
            <FilterChip
              key={status}
              href={listHref(query, { status })}
              $active={query.status === status}
            >
              {ENGAGEMENT_STATUS_META[status].label}
            </FilterChip>
          ))}
        </div>

        <FilterBar key={JSON.stringify(query)} onSubmit={submitFilters}>
          <input type="hidden" name="status" value={query.status || ''} />
          <FilterField>
            <span>Search</span>
            <input
              type="search"
              name="search"
              defaultValue={query.search || ''}
              placeholder="Engagement, scope, client"
            />
          </FilterField>
          <FilterField>
            <span>Client</span>
            <select name="clientId" defaultValue={query.clientId || ''}>
              <option value="">Anyone</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            <span>Frequency</span>
            <select name="frequency" defaultValue={query.frequency || ''}>
              <option value="">Any</option>
              {Object.entries(ENGAGEMENT_FREQUENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            <span>Renewals</span>
            <select name="renewal" defaultValue={query.renewal || ''}>
              <option value="">Any</option>
              <option value="due_30">Next 30 days</option>
              <option value="due_90">Next 90 days</option>
            </select>
          </FilterField>
          <Actions>
            <Button type="submit">
              <Search size={14} />
              Apply
            </Button>
            <Button
              type="button"
              $variant="ghost"
              onClick={() => router.push('/workspace/clients/engagements')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {creating || editing ? (
          <div style={{ padding: '4px 0 12px' }}>
            <EngagementForm
              engagement={editing}
              clients={clients}
              linkOptions={linkOptions}
              members={members}
              onDone={() => {
                setCreating(false);
                setEditing(null);
                setNotice(editing ? 'Engagement saved.' : 'Engagement created.');
                router.refresh();
              }}
              onCancel={() => {
                setCreating(false);
                setEditing(null);
              }}
            />
          </div>
        ) : null}

        {notice ? <Hint>{notice}</Hint> : null}

        {items.length === 0 ? (
          <EmptyState>
            <CalendarClock size={17} aria-hidden="true" />
            <div>
              <h3>No engagements match these filters</h3>
              <p>Create an engagement to track a service delivered over time.</p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Engagement</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Frequency</th>
                  <th>Manager</th>
                  <th>Renewal</th>
                  <th>Value</th>
                  <th>Change status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const status = metaFor(ENGAGEMENT_STATUS_META, item.status);
                  return (
                    <tr key={item.id}>
                      <td>
                        {item.name}
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {item.serviceName || 'No catalogue link'}
                          {item.projectReference ? ` · ${item.projectReference}` : ''}
                        </div>
                      </td>
                      <td>
                        <Link href={`/workspace/clients/${item.clientId}`}>
                          {item.companyName}
                        </Link>
                      </td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>{ENGAGEMENT_FREQUENCY_LABELS[item.frequency] || item.frequency}</td>
                      <td>{item.managerName || 'Unassigned'}</td>
                      <td>
                        {formatDate(item.renewalDate, timezone)}
                        {item.renewalDate ? (
                          <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                            {renewalLabel(item.renewalDueInDays)}
                          </div>
                        ) : null}
                      </td>
                      <td>{formatMoney(item.contractValueCents, item.currency)}</td>
                      <td>
                        <StatusControl
                          engagement={item}
                          canEdit={canEdit}
                          onChanged={() => router.refresh()}
                        />
                      </td>
                      <td>
                        {canEdit ? (
                          <Button
                            type="button"
                            $variant="ghost"
                            onClick={() => {
                              setCreating(false);
                              setEditing(item);
                            }}
                          >
                            <Pencil size={13} />
                            Edit
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}

        <ListPager
          page={page}
          pages={pages}
          total={total}
          pageSize={pageSize}
          hrefFor={(target) => listHref(query, { page: target })}
        />
      </Card>

      <Hint>
        Contract value here is an internal service reference. It is not invoiced
        revenue and no renewal is scheduled automatically.
      </Hint>
    </Page>
  );
}
