'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Plus, Search } from 'lucide-react';
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
  Lead,
  LinkButton,
  Page,
  Table,
  TableWrap,
  Title,
} from '@/components/workspace/ai/primitives';
import { formatDateTime } from '@/lib/ai/format';
import {
  FilterBar,
  FilterChip,
  FilterField,
  ListPager,
} from '@/components/workspace/phase2c/ui';
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  provenanceMeta,
  statusMeta,
} from './meta';

const LIST_KEYS = ['q', 'category', 'status', 'sort', 'page'];
const STATUS_CHIPS = ['any', 'draft', 'published', 'archived'];

function listHref(query, overrides = {}) {
  const merged = { ...query, page: 1, ...overrides };
  const search = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = merged[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    if (key === 'category' && value === 'any') continue;
    if (key === 'status' && value === 'any') continue;
    if (key === 'sort' && value === 'recent') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `/workspace/memory/knowledge?${text}` : '/workspace/memory/knowledge';
}

export default function KnowledgeListView({ result, query, canCreate, timezone }) {
  const router = useRouter();
  const { items, total, page, pages, pageSize } = result;

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
        <Eyebrow>Memory & knowledge</Eyebrow>
        <Title>Knowledge base</Title>
        <Lead>
          Company profile, services, processes, pricing, policies, sales,
          marketing and client- or project-specific knowledge. Duplicate content
          is rejected, and every entry keeps a version history and provenance.
        </Lead>
      </Header>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Entries</CardTitle>
            <CardText>
              {total} {total === 1 ? 'entry' : 'entries'} match the current
              filters. Showing page {page} of {pages}.
            </CardText>
          </div>
          <Actions>
            {canCreate ? (
              <LinkButton href="/workspace/memory/knowledge/new" $primary>
                <Plus size={15} />
                New entry
              </LinkButton>
            ) : null}
          </Actions>
        </CardHead>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STATUS_CHIPS.map((status) => (
            <FilterChip
              key={status}
              href={listHref(query, { status })}
              $active={(query.status || 'any') === status}
            >
              {status === 'any' ? 'All statuses' : statusMeta(status).label}
            </FilterChip>
          ))}
        </div>

        <FilterBar key={JSON.stringify(query)} onSubmit={submitFilters}>
          <input type="hidden" name="status" value={query.status || 'any'} />
          <FilterField>
            <span>Search</span>
            <input
              type="search"
              name="q"
              defaultValue={query.q || ''}
              placeholder="Title, summary, content or tags"
            />
          </FilterField>
          <FilterField>
            <span>Category</span>
            <select name="category" defaultValue={query.category || 'any'}>
              <option value="any">All categories</option>
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            <span>Sort by</span>
            <select name="sort" defaultValue={query.sort || 'recent'}>
              <option value="recent">Recently created</option>
              <option value="updated">Recently updated</option>
              <option value="title">Title</option>
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
              onClick={() => router.push('/workspace/memory/knowledge')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <BookOpen size={17} aria-hidden="true" />
            <div>
              <h3>No knowledge entries match these filters</h3>
              <p>
                Only published entries reach AI runs, but draft entries are
                visible here for review.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Provenance</th>
                  <th>Scope</th>
                  <th>Version</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => {
                  const status = statusMeta(entry.status);
                  const provenance = provenanceMeta(entry.provenance);
                  return (
                    <tr key={entry.id}>
                      <td>
                        <Link href={`/workspace/memory/knowledge/${entry.id}`}>
                          {entry.title}
                        </Link>
                        <div
                          style={{
                            fontSize: '0.72rem',
                            color: '#64748B',
                            maxWidth: 320,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {entry.contentPreview}
                        </div>
                      </td>
                      <td>{categoryLabel(entry.category)}</td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>
                        <Badge $tone={provenance.tone}>{provenance.label}</Badge>
                      </td>
                      <td>
                        {entry.clientName || entry.projectName
                          ? [entry.clientName, entry.projectName]
                              .filter(Boolean)
                              .join(' · ')
                          : 'Workspace-wide'}
                      </td>
                      <td>v{entry.version}</td>
                      <td>{formatDateTime(entry.updatedAt, timezone)}</td>
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
    </Page>
  );
}
