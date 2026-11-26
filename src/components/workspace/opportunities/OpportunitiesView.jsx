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
  Target,
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
import { formatDate, formatDateTime } from '@/lib/ai/format';
import {
  FilterBar,
  FilterChip,
  FilterField,
  ListPager,
} from '@/components/workspace/phase2c/ui';
import {
  formatValue,
  isOverdue,
  metaFor,
} from '@/components/workspace/phase2c/meta';
import {
  OPPORTUNITY_STAGE_META,
  OPPORTUNITY_STAGE_ORDER,
} from '@/components/workspace/phase2d/meta';
import OpportunityForm from './OpportunityForm';

const LIST_KEYS = [
  'search',
  'stage',
  'owner',
  'leadId',
  'scope',
  'due',
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
    if (key === 'scope' && value === 'open') continue;
    if (key === 'sort' && value === 'created') continue;
    if (key === 'direction' && value === 'desc') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `/workspace/opportunities?${text}` : '/workspace/opportunities';
}

export default function OpportunitiesView({
  opportunities,
  overview,
  leads,
  members,
  query,
  canCreate,
  canAssign,
  timezone,
  initialLeadId = '',
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(Boolean(initialLeadId));
  const [notice, setNotice] = useState(null);
  const [failure, setFailure] = useState(null);

  const { items, total, page, pages, pageSize } = opportunities;
  const fixedLead = initialLeadId
    ? leads.find((lead) => lead.id === initialLeadId)
    : null;
  const filteredLead = query.leadId
    ? leads.find((lead) => lead.id === query.leadId)
    : null;

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

  function handleCreated(result) {
    setShowCreate(false);
    setFailure(null);
    setNotice({
      message: `"${result.opportunity.title}" was created.`,
      href: `/workspace/opportunities/${result.opportunity.id}`,
    });
    router.refresh();
  }

  return (
    <Page>
      <Header>
        <Eyebrow>Sales pipeline</Eyebrow>
        <Title>Opportunities and discovery</Title>
        <Lead>
          Opportunities extend the lead pipeline rather than duplicating it. A
          lead can hold several opportunities, each with its own stage, value,
          owner and structured discovery record.
        </Lead>
      </Header>

      {notice ? (
        <Notice $tone="success">
          <BadgeCheck size={15} />
          <span>
            {notice.message}{' '}
            <Link href={notice.href} style={{ fontWeight: 600 }}>
              Open opportunity
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

      {fixedLead ? (
        <Notice $tone="info">
          <span>
            Creating an opportunity for <strong>{fixedLead.companyName}</strong>.
            This link only prefills the lead; nothing is created until you save.
          </span>
        </Notice>
      ) : null}

      {filteredLead ? (
        <Notice $tone="info">
          <span>
            Showing opportunities for <strong>{filteredLead.companyName}</strong>.
          </span>
          <Link href={listHref(query, { leadId: undefined })}>Clear lead filter</Link>
        </Notice>
      ) : null}

      <StatGrid>
        <StatCard>
          <StatLabel>Open opportunities</StatLabel>
          <StatValue>{overview.open}</StatValue>
          <StatNote>{overview.total} total recorded</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Pipeline value</StatLabel>
          <StatValue>
            {formatValue(overview.pipelineValueCents, overview.pipelineCurrency)}
          </StatValue>
          <StatNote>
            Expected open value
            {overview.pipelineCurrencies > 1
              ? ` · ${overview.pipelineCurrencies} currencies recorded`
              : ''}
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Closing in 30 days</StatLabel>
          <StatValue>{overview.closingSoon}</StatValue>
          <StatNote>{overview.overdueFollowUps} overdue follow-up(s)</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Won / lost</StatLabel>
          <StatValue>
            {overview.won} / {overview.lost}
          </StatValue>
          <StatNote>{overview.requirementsInReview} requirement(s) in review</StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Opportunities</CardTitle>
            <CardText>
              {total} {total === 1 ? 'opportunity' : 'opportunities'} match the
              current filters. Showing page {page} of {pages}.
            </CardText>
          </div>
          <Actions>
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
                {showCreate ? 'Close form' : 'New opportunity'}
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
            <CardTitle style={{ marginBottom: 12 }}>Create an opportunity</CardTitle>
            <OpportunityForm
              leadOptions={leads}
              members={members}
              canAssign={canAssign}
              fixedLeadId={initialLeadId}
              onDone={handleCreated}
              onCancel={() => {
                setShowCreate(false);
                if (fixedLead) router.push('/workspace/opportunities');
              }}
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
          <FilterChip
            href={listHref(query, { stage: undefined })}
            $active={!query.stage}
          >
            All stages
          </FilterChip>
          {OPPORTUNITY_STAGE_ORDER.map((stage) => (
            <FilterChip
              key={stage}
              href={listHref(query, { stage })}
              $active={query.stage === stage}
            >
              {metaFor(OPPORTUNITY_STAGE_META, stage).label}
            </FilterChip>
          ))}
        </div>

        <FilterBar key={JSON.stringify(query)} onSubmit={submitFilters}>
          <input type="hidden" name="stage" value={query.stage || ''} />
          <input type="hidden" name="leadId" value={query.leadId || ''} />
          <FilterField>
            <span>Search</span>
            <input
              type="search"
              name="search"
              defaultValue={query.search || ''}
              placeholder="Opportunity, company, contact"
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
            <span>Scope</span>
            <select name="scope" defaultValue={query.scope || 'open'}>
              <option value="open">Open</option>
              <option value="closed">Won or lost</option>
              <option value="all">All</option>
            </select>
          </FilterField>
          <FilterField>
            <span>Follow-up</span>
            <select name="due" defaultValue={query.due || ''}>
              <option value="">Any</option>
              <option value="overdue">Overdue</option>
              <option value="upcoming">Next 7 days</option>
            </select>
          </FilterField>
          <FilterField>
            <span>Sort by</span>
            <select name="sort" defaultValue={query.sort || 'created'}>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="value">Expected value</option>
              <option value="closeDate">Close date</option>
              <option value="followUp">Follow-up date</option>
              <option value="stage">Stage</option>
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
              onClick={() => router.push('/workspace/opportunities')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <Target size={17} aria-hidden="true" />
            <div>
              <h3>No opportunities match these filters</h3>
              <p>
                Create an opportunity from a lead or clear the filters. Closing
                an opportunity records a won or lost outcome without converting
                the lead automatically.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Opportunity</th>
                  <th>Stage</th>
                  <th>Expected value</th>
                  <th>Owner</th>
                  <th>Close date</th>
                  <th>Follow-up</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const stage = metaFor(OPPORTUNITY_STAGE_META, item.stage);
                  const overdue = isOverdue(item.nextFollowUpAt);
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/workspace/opportunities/${item.id}`}>
                          {item.title}
                        </Link>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          <Link href={`/workspace/leads/${item.leadId}`}>
                            {item.companyName}
                          </Link>
                          {item.contactName ? ` · ${item.contactName}` : ''}
                        </div>
                      </td>
                      <td>
                        <Badge $tone={stage.tone}>{stage.label}</Badge>
                      </td>
                      <td>
                        {item.expectedValueCents == null
                          ? '—'
                          : formatValue(item.expectedValueCents, item.currency)}
                      </td>
                      <td>{item.ownerName || item.ownerEmail || 'Unassigned'}</td>
                      <td>{formatDate(item.expectedCloseDate, timezone)}</td>
                      <td>
                        {formatDateTime(item.nextFollowUpAt, timezone)}
                        {overdue ? (
                          <>
                            {' '}
                            <Badge $tone="danger">Overdue</Badge>
                          </>
                        ) : null}
                      </td>
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

      <Hint>
        Pipeline value uses recorded expected values for open opportunities. It
        is not revenue received and is not a proposal or contract total.
      </Hint>
    </Page>
  );
}
