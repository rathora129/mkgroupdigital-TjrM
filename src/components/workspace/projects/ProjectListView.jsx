'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  CircleAlert,
  FolderKanban,
  Plus,
  Search,
  Users,
} from 'lucide-react';
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
  LinkButton,
  Notice,
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
import { formatDate, formatDateTime } from '@/lib/ai/format';
import {
  FilterBar,
  FilterChip,
  FilterField,
  ListPager,
  MetaGrid,
  Subhead,
} from '@/components/workspace/phase2c/ui';
import { formatMoney } from '@/components/workspace/proposals/meta';
import {
  metaFor,
  PRIORITY_META,
  PROJECT_STATUS_META,
} from './meta';

const STATUS_ORDER = [
  'not_started',
  'planning',
  'in_progress',
  'client_review',
  'on_hold',
  'completed',
  'cancelled',
];

const LIST_KEYS = [
  'search',
  'status',
  'owner',
  'risk',
  'sort',
  'direction',
  'page',
];

function listHref(query, overrides = {}) {
  const merged = { ...query, page: 1, ...overrides };
  const search = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = merged[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    if (key === 'sort' && value === 'created') continue;
    if (key === 'direction' && value === 'desc') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `/workspace/projects?${text}` : '/workspace/projects';
}

export default function ProjectListView({
  projects,
  overview,
  members,
  query,
  canCreate,
  timezone,
}) {
  const router = useRouter();
  const { items, total, page, pages, pageSize } = projects;

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
        <Eyebrow>Delivery operations</Eyebrow>
        <Title>Projects and workload</Title>
        <Lead>
          Projects start from an accepted proposal and carry a frozen snapshot
          of the agreed commercial scope. Planned work, milestones and effort
          live here; nothing on this page is billable revenue until an invoice
          is issued.
        </Lead>
      </Header>

      <Notice $tone="info">
        <FolderKanban size={15} />
        <span>
          Accepted proposals are never rewritten. A scope change is recorded as a
          request with its own decision history.
        </span>
      </Notice>

      <StatGrid>
        <StatCard>
          <StatLabel>Active projects</StatLabel>
          <StatValue>{overview.active}</StatValue>
          <StatNote>
            {overview.notStarted} not started · {overview.onHold} on hold
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Overdue tasks</StatLabel>
          <StatValue>{overview.overdueTasks}</StatValue>
          <StatNote>{overview.dueToday} due today across all projects</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Upcoming milestones</StatLabel>
          <StatValue>{overview.upcomingMilestones}</StatValue>
          <StatNote>Not yet approved, due in the next 14 days</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Completed projects</StatLabel>
          <StatValue>{overview.completed}</StatValue>
          <StatNote>{overview.cancelled} cancelled · {overview.total} total</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Projects</CardTitle>
            <CardText>
              {total} {total === 1 ? 'project' : 'projects'} match the current
              filters. Showing page {page} of {pages}.
            </CardText>
          </div>
          <Actions>
            {canCreate ? (
              <LinkButton href="/workspace/projects/new" $primary>
                <Plus size={15} />
                New project
              </LinkButton>
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
              {PROJECT_STATUS_META[status].label}
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
              placeholder="Reference, project, client"
            />
          </FilterField>
          <FilterField>
            <span>Owner</span>
            <select name="owner" defaultValue={query.owner || ''}>
              <option value="">Anyone</option>
              <option value="me">Owned by me</option>
              <option value="unassigned">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name || member.email}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            <span>Risk</span>
            <select name="risk" defaultValue={query.risk || ''}>
              <option value="">Any</option>
              <option value="at_risk">Past expected completion</option>
              <option value="due_soon">Completing in 14 days</option>
            </select>
          </FilterField>
          <FilterField>
            <span>Sort by</span>
            <select name="sort" defaultValue={query.sort || 'created'}>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="completion">Expected completion</option>
              <option value="priority">Priority</option>
            </select>
          </FilterField>
          <FilterField>
            <span>Direction</span>
            <select name="direction" defaultValue={query.direction || 'desc'}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
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
              onClick={() => router.push('/workspace/projects')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <FolderKanban size={17} aria-hidden="true" />
            <div>
              <h3>No projects match these filters</h3>
              <p>
                A project can only be created from an accepted proposal. Accept
                a proposal first, then create the delivery project here.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Accepted scope</th>
                  <th>Expected completion</th>
                  <th>Tasks</th>
                  <th>Owner</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const status = metaFor(PROJECT_STATUS_META, item.status);
                  const priority = metaFor(PRIORITY_META, item.priority);
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/workspace/projects/${item.id}`}>
                          {item.name}
                        </Link>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {item.reference}
                          {item.proposalReference
                            ? ` · from ${item.proposalReference}`
                            : ''}
                        </div>
                      </td>
                      <td>{item.companyName || '—'}</td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                        {item.isAtRisk ? (
                          <div style={{ fontSize: '0.7rem', color: '#B45309' }}>
                            Past expected completion
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <Badge $tone={priority.tone}>{priority.label}</Badge>
                      </td>
                      <td>{formatMoney(item.acceptedValueCents, item.currency)}</td>
                      <td>{formatDate(item.expectedCompletionDate, timezone)}</td>
                      <td>
                        {item.openTasks} open
                        {item.overdueTasks > 0 ? (
                          <span style={{ color: '#B91C1C' }}>
                            {' '}
                            · {item.overdueTasks} overdue
                          </span>
                        ) : null}
                      </td>
                      <td>{item.ownerName || item.ownerEmail || 'Unassigned'}</td>
                      <td>{formatDateTime(item.updatedAt, timezone)}</td>
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

      <Card>
        <CardHead>
          <div>
            <CardTitle>Open workload by owner</CardTitle>
            <CardText>Counts every open task, not just the current page.</CardText>
          </div>
          <Users size={16} aria-hidden="true" />
        </CardHead>
        {overview.workload.length === 0 ? (
          <CardText>No open tasks are assigned yet.</CardText>
        ) : (
          <MetaGrid>
            {overview.workload.map((row) => (
              <div key={row.ownerUserId || 'unassigned'}>
                <dt>{row.name}</dt>
                <dd>{row.openTasks} open tasks</dd>
              </div>
            ))}
          </MetaGrid>
        )}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Planned vs completed</CardTitle>
            <CardText>
              Planned delivery work is separate from commercial and cash figures.
            </CardText>
          </div>
          <CalendarClock size={16} aria-hidden="true" />
        </CardHead>
        <Subhead>Pipeline</Subhead>
        <MetaGrid>
          <div>
            <dt>Not started</dt>
            <dd>{overview.notStarted} projects</dd>
          </div>
          <div>
            <dt>Planning</dt>
            <dd>{overview.planning} projects</dd>
          </div>
          <div>
            <dt>In progress</dt>
            <dd>{overview.inProgress} projects</dd>
          </div>
          <div>
            <dt>Client review</dt>
            <dd>{overview.clientReview} projects</dd>
          </div>
        </MetaGrid>
        <Subhead>Delivered</Subhead>
        <MetaGrid>
          <div>
            <dt>Completed</dt>
            <dd>{overview.completed} projects</dd>
          </div>
          <div>
            <dt>Cancelled</dt>
            <dd>{overview.cancelled} projects</dd>
          </div>
        </MetaGrid>
      </Card>

      <Hint>
        <CircleAlert size={12} aria-hidden="true" /> Accepted proposal value is an
        approved commercial amount. It is neither invoiced nor collected until
        the finance workflow records it.
      </Hint>
    </Page>
  );
}
