'use client';

import styled from 'styled-components';
import {
  BarChart3,
  CircleAlert,
  FolderKanban,
  PhoneCall,
  Radar,
  TrendingUp,
  Upload,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardHead,
  CardText,
  CardTitle,
  Eyebrow,
  Header,
  Notice,
  Page,
  Stack,
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Table,
  TableWrap,
  Title,
  EmptyState,
  Lead,
} from '@/components/workspace/ai/primitives';
import { MetaGrid } from '@/components/workspace/phase2c/ui';
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_META,
  metaFor,
} from '@/components/workspace/phase2c/meta';
import { PROJECT_STATUS_META } from '@/components/workspace/projects/meta';
import { formatMoney } from '@/components/workspace/proposals/meta';
import { formatDateTime } from '@/lib/ai/format';
import { CALL_OUTCOME_META } from '@/lib/sales/validation';
import { PROJECT_STATUS_LABELS } from '@/lib/projects/transitions';

const DISCOVERY_CAMPAIGN_LABELS = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const PROSPECT_STATUS_LABELS = {
  pending_review: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  duplicate: 'Duplicate',
};

const ACTIVITY_LABELS = {
  created: 'Lead created',
  updated: 'Lead updated',
  status_change: 'Stage change',
  assigned: 'Assigned',
  note: 'Note',
  call_logged: 'Call logged',
  follow_up_created: 'Follow-up created',
  meeting_scheduled: 'Meeting scheduled',
  imported: 'Imported',
  converted_to_client: 'Converted to client',
  converted_to_project: 'Project created',
  reported_amounts_updated: 'Reported amounts updated',
};

const Pair = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 16px;

  > section {
    flex: 1 1 320px;
  }
`;

function MetaGridItems({ items }) {
  return (
    <MetaGrid>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </MetaGrid>
  );
}

function statEntries(map, labels) {
  return Object.entries(map || {})
    .map(([key, value]) => ({
      key,
      value,
      label: labels[key] || key,
    }))
    .sort((left, right) => right.value - left.value);
}

export default function BusinessDashboardView({
  data,
  recentActivity,
  timezone,
}) {
  const { leads, discovery, imports, sales, delivery, clients, money } = data;

  const statusEntries = statEntries(leads.byStatus, Object.fromEntries(
    Object.entries(LEAD_STATUS_META).map(([key, meta]) => [key, meta.label]),
  ));
  const campaignEntries = statEntries(discovery.campaignsByStatus, DISCOVERY_CAMPAIGN_LABELS);
  const prospectEntries = statEntries(discovery.prospectsByStatus, PROSPECT_STATUS_LABELS);
  const projectEntries = statEntries(
    delivery.projectsByStatus,
    Object.fromEntries(
      Object.entries(PROJECT_STATUS_LABELS || PROJECT_STATUS_META).map(
        ([key, meta]) => [key, typeof meta === 'string' ? meta : meta.label],
      ),
    ),
  );
  const callEntries = statEntries(sales.byOutcome, Object.fromEntries(
    Object.entries(CALL_OUTCOME_META).map(([key, meta]) => [key, meta.label]),
  ));

  return (
    <Page>
      <Header>
        <Eyebrow>Owner intelligence</Eyebrow>
        <Title>Business intelligence</Title>
        <Lead>
          Live figures from this workspace only. Reported amounts are the figures
          the owner or import supplied — they are not verified payments. Finance
          totals come from issued invoices and recorded payments.
        </Lead>
      </Header>

      <Stack $gap={16}>
        <StatGrid>
          <StatCard>
            <StatLabel>Active leads</StatLabel>
            <StatValue>{leads.total}</StatValue>
            <StatNote>
              {leads.newInWindow} new in {data.windowDays} days ·{' '}
              {leads.unassigned} unassigned
            </StatNote>
          </StatCard>
          <StatCard>
            <StatLabel>Qualified pipeline</StatLabel>
            <StatValue>{leads.qualifiedTotal}</StatValue>
            <StatNote>
              {leads.wonTotal} won · {leads.conversionRate}% of active leads
            </StatNote>
          </StatCard>
          <StatCard>
            <StatLabel>Won in {data.windowDays} days</StatLabel>
            <StatValue>{leads.wonInWindow}</StatValue>
            <StatNote>{leads.wonTotal} won leads in total</StatNote>
          </StatCard>
          <StatCard>
            <StatLabel>Overdue follow-ups</StatLabel>
            <StatValue>{leads.followUpsOverdue}</StatValue>
            <StatNote>Open leads with a past follow-up date</StatNote>
          </StatCard>
          <StatCard>
            <StatLabel>Clients</StatLabel>
            <StatValue>{clients.total}</StatValue>
            <StatNote>{clients.newInWindow} added in {data.windowDays} days</StatNote>
          </StatCard>
          <StatCard>
            <StatLabel>Active projects</StatLabel>
            <StatValue>{delivery.activeProjects}</StatValue>
            <StatNote>
              {delivery.openTasks} open tasks · {delivery.overdueTasks} overdue
            </StatNote>
          </StatCard>
        </StatGrid>

        <Pair>
          <Card>
            <CardHead>
              <div>
                <CardTitle>Lead acquisition by source</CardTitle>
                <CardText>
                  Every active lead grouped by how it entered the workspace.
                </CardText>
              </div>
              <Badge $tone="info">{leads.bySource.length} sources</Badge>
            </CardHead>
            {leads.bySource.length === 0 ? (
              <EmptyState>
                <Users size={20} aria-hidden="true" />
                <p>No active leads have been recorded yet.</p>
              </EmptyState>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Leads</th>
                      <th>Qualified+</th>
                      <th>Won</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.bySource.map((row) => (
                      <tr key={row.source}>
                        <td>{LEAD_SOURCE_LABELS[row.source] || row.source}</td>
                        <td>{row.leads}</td>
                        <td>{row.qualified}</td>
                        <td>{row.won}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Pipeline stages</CardTitle>
                <CardText>Active leads by current stage.</CardText>
              </div>
              <Badge $tone="muted">{leads.total} leads</Badge>
            </CardHead>
            {statusEntries.length === 0 ? (
              <EmptyState>
                <TrendingUp size={20} aria-hidden="true" />
                <p>No active leads yet.</p>
              </EmptyState>
            ) : (
              <MetaGridItems
                items={statusEntries.map((row) => ({
                  label: row.label,
                  value: row.value,
                }))}
              />
            )}
          </Card>
        </Pair>

        <Pair>
          <Card>
            <CardHead>
              <div>
                <CardTitle>AI discovery</CardTitle>
                <CardText>
                  Candidates come from connected providers and wait for human
                  review before becoming leads.
                </CardText>
              </div>
              <Radar size={18} aria-hidden="true" />
            </CardHead>
            <MetaGridItems
              items={[
                { label: 'Pending review', value: discovery.pendingReview },
                { label: 'Runs (30 days)', value: discovery.runs },
                { label: 'Discovered', value: discovery.discovered },
                { label: 'Duplicates', value: discovery.duplicates },
                { label: 'Failed', value: discovery.failed },
              ]}
            />
            <CardText>
              {campaignEntries.length
                ? campaignEntries
                    .map((row) => `${row.label}: ${row.value}`)
                    .join(' · ')
                : 'No discovery campaigns yet.'}
            </CardText>
            <CardText>
              {prospectEntries.length
                ? prospectEntries
                    .map((row) => `${row.label}: ${row.value}`)
                    .join(' · ')
                : 'No discovery prospects yet.'}
            </CardText>
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Owner imports</CardTitle>
                <CardText>
                  Paste or file batches committed into native leads. Repeats are
                  refused unless explicitly confirmed.
                </CardText>
              </div>
              <Upload size={18} aria-hidden="true" />
            </CardHead>
            <MetaGridItems
              items={[
                { label: 'Committed batches', value: imports.batches },
                { label: 'Imported rows', value: imports.importedRows },
                { label: 'Duplicate rows', value: imports.duplicateRows },
                {
                  label: 'Last commit',
                  value: imports.lastCommittedAt
                    ? formatDateTime(imports.lastCommittedAt, timezone)
                    : '—',
                },
              ]}
            />
          </Card>
        </Pair>

        <Pair>
          <Card>
            <CardHead>
              <div>
                <CardTitle>Sales activity</CardTitle>
                <CardText>
                  Calls logged and meetings in the last {data.windowDays} days.
                </CardText>
              </div>
              <PhoneCall size={18} aria-hidden="true" />
            </CardHead>
            <MetaGridItems
              items={[
                { label: 'Calls logged', value: sales.calls },
                { label: 'Leads contacted', value: sales.leadsContacted },
                { label: 'Upcoming meetings', value: sales.meetingsUpcoming },
                {
                  label: 'Completed meetings',
                  value: sales.meetingsCompletedInWindow,
                },
              ]}
            />
            <CardText>
              {callEntries.length
                ? callEntries
                    .map((row) => `${row.label}: ${row.value}`)
                    .join(' · ')
                : 'No call outcomes recorded in this window.'}
            </CardText>
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Delivery load</CardTitle>
                <CardText>Projects and open work across the workspace.</CardText>
              </div>
              <FolderKanban size={18} aria-hidden="true" />
            </CardHead>
            <MetaGridItems
              items={projectEntries.map((row) => ({
                label: row.label,
                value: row.value,
              }))}
            />
            <CardText>
              {delivery.openTasks} open tasks · {delivery.overdueTasks} overdue
            </CardText>
          </Card>
        </Pair>

        <Card>
          <CardHead>
            <div>
              <CardTitle>Money — reported vs verified</CardTitle>
              <CardText>
                Reported figures are owner-supplied and unverified. Verified
                figures are recorded payments and issued invoices.
              </CardText>
            </div>
            <Wallet size={18} aria-hidden="true" />
          </CardHead>

          <Notice $tone="warning">
            <CircleAlert size={16} aria-hidden="true" />
            Reported amounts never create a payment or an invoice. Finance
            records remain authoritative.
          </Notice>

          <div>
            <CardTitle style={{ fontSize: '0.85rem' }}>
              Reported by the owner ({leads.reportedLeadCount} leads ·{' '}
              {leads.reportedVerifiedLeadCount} human-verified)
            </CardTitle>
            {money.reportedByCurrency.length === 0 ? (
              <CardText>No reported amounts have been recorded.</CardText>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>Currency</th>
                      <th>Received (reported)</th>
                      <th>Outstanding (reported)</th>
                      <th>Project cost (reported)</th>
                      <th>Leads</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {money.reportedByCurrency.map((row) => (
                      <tr key={row.currency}>
                        <td>{row.currency}</td>
                        <td>{formatMoney(row.receivedCents, row.currency)}</td>
                        <td>{formatMoney(row.outstandingCents, row.currency)}</td>
                        <td>{formatMoney(row.projectCostCents, row.currency)}</td>
                        <td>{row.leadCount}</td>
                        <td>
                          {row.unverifiedLeads > 0 ? (
                            <Badge $tone="warning">
                              {row.unverifiedLeads} unverified
                            </Badge>
                          ) : (
                            <Badge $tone="success">Verified</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </div>

          <div>
            <CardTitle style={{ fontSize: '0.85rem' }}>
              Verified finance records
            </CardTitle>
            {money.verifiedPaymentsByCurrency.length === 0 &&
            money.outstandingInvoicesByCurrency.length === 0 ? (
              <CardText>
                No payments or issued invoices have been recorded yet.
              </CardText>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>Currency</th>
                      <th>Recorded payments</th>
                      <th>Invoice balance due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...new Set([
                        ...money.verifiedPaymentsByCurrency.map(
                          (row) => row.currency,
                        ),
                        ...money.outstandingInvoicesByCurrency.map(
                          (row) => row.currency,
                        ),
                      ]),
                    ].map((currency) => {
                      const paid = money.verifiedPaymentsByCurrency.find(
                        (row) => row.currency === currency,
                      );
                      const due = money.outstandingInvoicesByCurrency.find(
                        (row) => row.currency === currency,
                      );
                      return (
                        <tr key={currency}>
                          <td>{currency}</td>
                          <td>
                            {paid
                              ? `${formatMoney(paid.paidCents, currency)} · ${paid.payments} payment(s)`
                              : '—'}
                          </td>
                          <td>
                            {due
                              ? `${formatMoney(due.outstandingCents, currency)} · ${due.invoices} invoice(s)`
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </div>
        </Card>

        <Card>
          <CardHead>
            <div>
              <CardTitle>Recent lead activity</CardTitle>
              <CardText>
                The latest entries from lead timelines across the workspace.
              </CardText>
            </div>
            <BarChart3 size={18} aria-hidden="true" />
          </CardHead>
          {recentActivity.length === 0 ? (
            <EmptyState>
              <Users size={20} aria-hidden="true" />
              <p>No lead activity has been recorded yet.</p>
            </EmptyState>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Lead</th>
                    <th>Event</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.createdAt, timezone)}</td>
                      <td>{row.companyName}</td>
                      <td>{ACTIVITY_LABELS[row.type] || row.type}</td>
                      <td>{row.body || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </Stack>
    </Page>
  );
}
