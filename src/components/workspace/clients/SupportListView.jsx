'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LifeBuoy, Plus, Search } from 'lucide-react';
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
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_META,
  TICKET_STATUS_META,
  metaFor,
} from './meta';
import TicketForm from './TicketForm';

const STATUS_ORDER = ['open', 'assigned', 'in_progress', 'waiting_client', 'resolved', 'closed'];
const LIST_KEYS = ['search', 'clientId', 'status', 'priority', 'assignee', 'due', 'page'];

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
  return text ? `/workspace/support?${text}` : '/workspace/support';
}

export default function SupportListView({
  tickets,
  overview,
  clients,
  projects,
  members,
  query,
  canCreate,
  timezone,
}) {
  const router = useRouter();
  const { items, total, page, pages, pageSize } = tickets;
  const [creating, setCreating] = useState(false);

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
        <Eyebrow>Client support</Eyebrow>
        <Title>Support queue</Title>
        <Lead>
          Track client issues with a controlled status flow, an assignee and a
          clear separation between internal notes and client-visible comments.
          The system never claims to have sent a message it did not send.
        </Lead>
      </Header>

      <StatGrid>
        <StatCard>
          <StatLabel>Open tickets</StatLabel>
          <StatValue>{overview.openTotal}</StatValue>
          <StatNote>
            {overview.open} open · {overview.inProgress} in progress ·{' '}
            {overview.waitingClient} waiting
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Overdue</StatLabel>
          <StatValue>{overview.overdue}</StatValue>
          <StatNote>Past their due date and still open</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Due today</StatLabel>
          <StatValue>{overview.dueToday}</StatValue>
          <StatNote>{overview.unassigned} open tickets unassigned</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Resolved</StatLabel>
          <StatValue>{overview.resolved}</StatValue>
          <StatNote>{overview.closed} closed · {overview.total} total</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Tickets</CardTitle>
            <CardText>
              {total} {total === 1 ? 'ticket' : 'tickets'} match the current
              filters.
            </CardText>
          </div>
          <Actions>
            {canCreate ? (
              <Button
                type="button"
                $variant="primary"
                onClick={() => setCreating((current) => !current)}
              >
                <Plus size={14} />
                New ticket
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
              {TICKET_STATUS_META[status].label}
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
              placeholder="Reference, subject, client"
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
            <span>Priority</span>
            <select name="priority" defaultValue={query.priority || ''}>
              <option value="">Any</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </FilterField>
          <FilterField>
            <span>Assignee</span>
            <select name="assignee" defaultValue={query.assignee || ''}>
              <option value="">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name || member.email}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            <span>Due</span>
            <select name="due" defaultValue={query.due || ''}>
              <option value="">Any time</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
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
              onClick={() => router.push('/workspace/support')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {creating ? (
          <div style={{ padding: '4px 0 12px' }}>
            <TicketForm
              clients={clients}
              projects={projects}
              members={members}
              onDone={(result) => {
                setCreating(false);
                if (result?.ticket?.id) {
                  router.push(`/workspace/support/${result.ticket.id}`);
                } else {
                  router.refresh();
                }
              }}
              onCancel={() => setCreating(false)}
            />
          </div>
        ) : null}

        {items.length === 0 ? (
          <EmptyState>
            <LifeBuoy size={17} aria-hidden="true" />
            <div>
              <h3>No tickets match these filters</h3>
              <p>Create a ticket to track a client issue through resolution.</p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Category</th>
                  <th>Assignee</th>
                  <th>Due</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const status = metaFor(TICKET_STATUS_META, item.status);
                  const priority = metaFor(TICKET_PRIORITY_META, item.priority);
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/workspace/support/${item.id}`}>
                          {item.reference}
                        </Link>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {item.subject}
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
                      <td>
                        <Badge $tone={priority.tone}>{priority.label}</Badge>
                      </td>
                      <td>{TICKET_CATEGORY_LABELS[item.category] || item.category}</td>
                      <td>{item.assigneeName || 'Unassigned'}</td>
                      <td>
                        {formatDate(item.dueDate, timezone)}
                        {item.isOverdue ? (
                          <div style={{ fontSize: '0.7rem', color: '#B91C1C' }}>Overdue</div>
                        ) : null}
                        {item.isDueToday ? (
                          <div style={{ fontSize: '0.7rem', color: '#B45309' }}>Due today</div>
                        ) : null}
                      </td>
                      <td>{formatDate(item.createdAt, timezone)}</td>
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
        Resolving a ticket records the resolution notes and timestamp. Reopening
        clears the resolution time so the age of the issue stays accurate.
      </Hint>
    </Page>
  );
}
