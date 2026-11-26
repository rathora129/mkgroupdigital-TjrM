'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  CircleAlert,
  Filter,
  Plus,
  Search,
  Upload,
  Users,
  X,
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
  Row,
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Table,
  TableWrap,
  Title,
} from '@/components/workspace/ai/primitives';
import { formatDateTime } from '@/lib/ai/format';
import LeadForm from './LeadForm';
import {
  FilterBar,
  FilterChip,
  FilterField,
  ListPager,
} from '@/components/workspace/phase2c/ui';
import {
  LEAD_PRIORITY_META,
  LEAD_STATUS_META,
  formatValue,
  isOverdue,
  metaFor,
} from '@/components/workspace/phase2c/meta';

const STATUS_ORDER = [
  'new',
  'researching',
  'qualified',
  'contacted',
  'follow_up',
  'meeting',
  'proposal',
  'won',
  'lost',
];

const LIST_KEYS = [
  'search',
  'status',
  'priority',
  'source',
  'assigned',
  'archived',
  'sort',
  'direction',
  'due',
  'page',
];

function listHref(query, overrides = {}) {
  const merged = { ...query, page: 1, ...overrides };
  const search = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = merged[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    if (key === 'archived' && value === 'active') continue;
    if (key === 'sort' && value === 'created') continue;
    if (key === 'direction' && value === 'desc') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `/workspace/leads?${text}` : '/workspace/leads';
}

export default function LeadsView({
  leads,
  overview,
  members,
  query,
  canCreate,
  canAssign,
  canImport,
  timezone,
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState(null);
  const [failure, setFailure] = useState(null);
  const [duplicates, setDuplicates] = useState([]);

  const { items, total, page, pages, pageSize } = leads;

  function submitFilters(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const overrides = {};
    for (const key of LIST_KEYS) {
      if (key === 'page') continue;
      const value = String(data.get(key) ?? '').trim();
      if (value) overrides[key] = value;
      else overrides[key] = undefined;
    }
    router.push(listHref(overrides));
  }

  function handleCreated(result) {
    setShowCreate(false);
    setFailure(null);
    setNotice(`"${result.lead.companyName}" was created.`);
    setDuplicates(result.possibleDuplicates || []);
    router.refresh();
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Leads</Eyebrow>
        <Title>Pipeline and qualification</Title>
        <Lead>
          Every lead records its source, owner, priority, follow-up date and
          full status history. Possible duplicates are shown for review; they
          are never merged automatically.
        </Lead>
      </Header>

      {notice ? (
        <Notice $tone="success">
          <BadgeCheck size={15} />
          <span>
            {notice}{' '}
            <Link href={listHref(query)} style={{ fontWeight: 600 }}>
              Show in list
            </Link>
          </span>
        </Notice>
      ) : null}
      {failure ? (
        <Notice $tone="danger">
          <CircleAlert size={15} />
          {failure}
        </Notice>
      ) : null}

      {duplicates.length > 0 ? (
        <Notice $tone="warning">
          <div>
            <strong>Possible duplicate leads found.</strong> Review these records
            before contacting the new lead. Nothing was merged.
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {duplicates.map((item) => (
                <li key={item.id} style={{ marginBottom: 4 }}>
                  <Link
                    href={`/workspace/leads/${item.id}`}
                    style={{ fontWeight: 600 }}
                  >
                    {item.companyName}
                  </Link>{' '}
                  · {item.status}
                  {item.email ? ` · ${item.email}` : ''}
                  {item.website ? ` · ${item.website}` : ''}
                  {item.reasons?.length ? ` · matched on ${item.reasons.join(', ')}` : ''}
                </li>
              ))}
            </ul>
          </div>
          <Button
            type="button"
            $variant="ghost"
            onClick={() => setDuplicates([])}
            aria-label="Dismiss duplicate notice"
          >
            <X size={15} />
          </Button>
        </Notice>
      ) : null}

      <StatGrid>
        <StatCard>
          <StatLabel>Active leads</StatLabel>
          <StatValue>{overview.total}</StatValue>
          <StatNote>{overview.archived} archived</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Qualified</StatLabel>
          <StatValue>{overview.byStatus.qualified || 0}</StatValue>
          <StatNote>Ready for outreach</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Proposal or meeting</StatLabel>
          <StatValue>
            {(overview.byStatus.meeting || 0) + (overview.byStatus.proposal || 0)}
          </StatValue>
          <StatNote>In late-stage conversations</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Overdue follow-ups</StatLabel>
          <StatValue>{overview.followUpsOverdue}</StatValue>
          <StatNote>{overview.assignedToMe} assigned to you</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Leads</CardTitle>
            <CardText>
              {total} {total === 1 ? 'lead' : 'leads'} match the current filters.
              Showing page {page} of {pages}.
            </CardText>
          </div>
          <Actions>
            {canImport ? (
              <LinkButton href="/workspace/leads/import">
                <Upload size={15} />
                Paste &amp; import
              </LinkButton>
            ) : null}
            {canCreate ? (
              <Button
                type="button"
                $variant="primary"
                onClick={() => {
                  setShowCreate((current) => !current);
                  setFailure(null);
                }}
              >
                {showCreate ? <X size={15} /> : <Plus size={15} />}
                {showCreate ? 'Close form' : 'New lead'}
              </Button>
            ) : null}
          </Actions>
        </CardHead>

        {showCreate && canCreate ? (
          <div
            style={{
              padding: 16,
              border: '1px solid #E5EAF1',
              borderRadius: 12,
              background: '#FFFFFF',
            }}
          >
            <CardTitle style={{ marginBottom: 12 }}>Create a lead</CardTitle>
            <LeadForm
              members={members}
              canAssign={canAssign}
              onDone={handleCreated}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        ) : null}

        <Row>
          <Filter size={14} aria-hidden="true" />
          <span style={{ fontSize: '0.76rem', color: '#64748B' }}>
            Filter and sort the pipeline
          </span>
        </Row>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <FilterChip href={listHref(query, { status: undefined })} $active={!query.status}>
            All stages
          </FilterChip>
          {STATUS_ORDER.map((status) => (
            <FilterChip
              key={status}
              href={listHref(query, { status })}
              $active={query.status === status}
            >
              {metaFor(LEAD_STATUS_META, status).label}
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
              placeholder="Company, contact, email, phone"
            />
          </FilterField>
          <FilterField>
            <span>Priority</span>
            <select name="priority" defaultValue={query.priority || ''}>
              <option value="">Any</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </FilterField>
          <FilterField>
            <span>Owner</span>
            <select name="assigned" defaultValue={query.assigned || ''}>
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
            <span>Records</span>
            <select name="archived" defaultValue={query.archived || 'active'}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </FilterField>
          <FilterField>
            <span>Sort by</span>
            <select name="sort" defaultValue={query.sort || 'created'}>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="company">Company</option>
              <option value="value">Estimated value</option>
              <option value="followUp">Follow-up date</option>
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
              onClick={() => router.push('/workspace/leads')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <Users size={17} aria-hidden="true" />
            <div>
              <h3>No leads match these filters</h3>
              <p>
                Create a lead or clear the filters. Archived leads stay out of
                the active list until you switch the records filter.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Stage</th>
                  <th>Priority</th>
                  <th>Value</th>
                  <th>Owner</th>
                  <th>Follow-up</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((lead) => {
                  const status = metaFor(LEAD_STATUS_META, lead.status);
                  const priority = metaFor(LEAD_PRIORITY_META, lead.priority);
                  const overdue = isOverdue(lead.nextFollowUpAt);
                  return (
                    <tr key={lead.id}>
                      <td>
                        <Link href={`/workspace/leads/${lead.id}`}>
                          {lead.companyName}
                        </Link>
                        {lead.contactName || lead.email ? (
                          <div
                            style={{ fontSize: '0.72rem', color: '#64748B' }}
                          >
                            {[lead.contactName, lead.email]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        ) : null}
                        {lead.archivedAt ? (
                          <Badge $tone="muted">Archived</Badge>
                        ) : null}
                      </td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>
                        <Badge $tone={priority.tone}>{priority.label}</Badge>
                      </td>
                      <td>
                        {lead.estimatedValueCents == null
                          ? '—'
                          : formatValue(
                              lead.estimatedValueCents,
                              lead.currency,
                            )}
                      </td>
                      <td>{lead.assignedName || lead.assignedEmail || 'Unassigned'}</td>
                      <td>
                        {formatDateTime(lead.nextFollowUpAt, timezone)}
                        {overdue ? (
                          <>
                            {' '}
                            <Badge $tone="danger">Overdue</Badge>
                          </>
                        ) : null}
                      </td>
                      <td>{formatDateTime(lead.updatedAt, timezone)}</td>
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
        Status changes follow the pipeline New → Researching → Qualified →
        Contacted → Follow-up → Meeting → Proposal → Won or Lost. Every change is
        recorded in the lead timeline.
      </Hint>
    </Page>
  );
}
