'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, Plus, Receipt, Search } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
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
  ErrorText,
  Field,
  Header,
  Hint,
  Label,
  Lead,
  Notice,
  Page,
  StatCard,
  StatGrid,
  StatLabel,
  StatNote,
  StatValue,
  Table,
  TableWrap,
  Textarea,
  Title,
} from '@/components/workspace/ai/primitives';
import { formatDate } from '@/lib/ai/format';
import {
  FilterBar,
  FilterChip,
  FilterField,
  ListPager,
} from '@/components/workspace/phase2c/ui';
import { formatMoney } from '@/components/workspace/proposals/meta';
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_STATUS_META,
  metaFor,
} from './meta';
import ExpenseForm from './ExpenseForm';

const STATUS_ORDER = ['pending_approval', 'approved', 'rejected'];
const LIST_KEYS = ['search', 'status', 'category', 'page'];

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
  return text ? `/workspace/finance/expenses?${text}` : '/workspace/finance/expenses';
}

function DecisionControl({ expense, onChanged }) {
  const [mode, setMode] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function decide(status) {
    setError(null);
    if (status === 'rejected' && notes.trim().length === 0) {
      setError('Give a reason when rejecting an expense.');
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`/api/workforce/expenses/${expense.id}/decision`, {
        method: 'POST',
        body: { status, decisionNotes: notes.trim() || null },
      });
      setMode(null);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!mode) {
    return (
      <Actions>
        <Button type="button" $variant="ghost" onClick={() => setMode('approved')}>
          Approve
        </Button>
        <Button type="button" $variant="ghost" onClick={() => setMode('rejected')}>
          Reject
        </Button>
      </Actions>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 180 }}>
      <Field>
        <Label>
          {mode === 'rejected' ? 'Reason for rejection' : 'Decision note (optional)'}
        </Label>
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2_000}
          style={{ minHeight: 44 }}
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
      </Field>
      <Actions>
        <Button
          type="button"
          $variant={mode === 'rejected' ? 'danger' : 'primary'}
          onClick={() => decide(mode)}
          disabled={busy}
        >
          {mode === 'rejected' ? 'Confirm reject' : 'Confirm approve'}
        </Button>
        <Button type="button" $variant="ghost" onClick={() => setMode(null)} disabled={busy}>
          Cancel
        </Button>
      </Actions>
    </div>
  );
}

export default function ExpenseListView({
  expenses,
  overview,
  projects,
  query,
  canCreate,
  canApprove,
  timezone,
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState(null);
  const { items, total, page, pages, pageSize } = expenses;

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
          <Link href="/workspace/finance">Finance</Link> · Expenses
        </Eyebrow>
        <Title>Operating expenses</Title>
        <Lead>
          Record internal costs and route them through approval. Approved
          expenses feed the finance overview; they never touch client invoices.
        </Lead>
      </Header>

      <Notice $tone="info">
        <CircleAlert size={15} />
        <span>
          Expense figures are shown in {overview.currency}. These are internal
          costs, not tax deductions or statutory claims.
        </span>
      </Notice>

      <StatGrid>
        <StatCard>
          <StatLabel>Pending approval</StatLabel>
          <StatValue>{overview.counts.pending_approval || 0}</StatValue>
          <StatNote>Awaiting a manager decision</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Approved this month</StatLabel>
          <StatValue>{formatMoney(overview.approvedThisMonthCents, overview.currency)}</StatValue>
          <StatNote>Expenses dated since the 1st</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Total records</StatLabel>
          <StatValue>{overview.total}</StatValue>
          <StatNote>
            {overview.counts.approved || 0} approved · {overview.counts.rejected || 0} rejected
          </StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Expenses</CardTitle>
            <CardText>
              {total} {total === 1 ? 'expense' : 'expenses'} match the current
              filters. Showing page {page} of {pages}.
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
                New expense
              </Button>
            ) : null}
          </Actions>
        </CardHead>

        {notice ? <Hint>{notice}</Hint> : null}

        {creating ? (
          <div style={{ padding: '4px 0 12px' }}>
            <ExpenseForm
              projects={projects}
              defaultCurrency={overview.currency}
              onDone={() => {
                setCreating(false);
                setNotice('Expense recorded.');
                router.refresh();
              }}
              onCancel={() => setCreating(false)}
            />
          </div>
        ) : null}

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
              {EXPENSE_STATUS_META[status].label}
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
              placeholder="Reference, description, vendor"
            />
          </FilterField>
          <FilterField>
            <span>Category</span>
            <select name="category" defaultValue={query.category || ''}>
              <option value="">Any</option>
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
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
              onClick={() => router.push('/workspace/finance/expenses')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <Receipt size={17} aria-hidden="true" />
            <div>
              <h3>No expenses match these filters</h3>
              <p>Record an expense to start tracking internal costs.</p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Expense</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Recorded by</th>
                  {canApprove ? <th>Decision</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const status = metaFor(EXPENSE_STATUS_META, item.status);
                  return (
                    <tr key={item.id}>
                      <td>
                        {item.description}
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {item.reference}
                          {item.vendor ? ` · ${item.vendor}` : ''}
                        </div>
                      </td>
                      <td>{EXPENSE_CATEGORY_LABELS[item.category] || item.category}</td>
                      <td>{formatDate(item.expenseDate, timezone)}</td>
                      <td>{formatMoney(item.amountCents, item.currency)}</td>
                      <td>{item.projectName || '—'}</td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                        {item.decisionNotes ? (
                          <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                            {item.decisionNotes}
                          </div>
                        ) : null}
                      </td>
                      <td>{item.recordedByName || '—'}</td>
                      {canApprove ? (
                        <td>
                          {item.status === 'pending_approval' ? (
                            <DecisionControl
                              expense={item}
                              onChanged={() => {
                                setNotice('Expense decided.');
                                router.refresh();
                              }}
                            />
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                              Reviewed
                            </span>
                          )}
                        </td>
                      ) : null}
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

      {overview.byCategory.length > 0 ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Approved spend by category</CardTitle>
              <CardText>All approved expenses in {overview.currency}.</CardText>
            </div>
          </CardHead>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {overview.byCategory.map((row) => (
              <div key={row.category}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#64748B' }}>
                  {EXPENSE_CATEGORY_LABELS[row.category] || row.category}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                  {formatMoney(row.amountCents, overview.currency)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </Page>
  );
}
