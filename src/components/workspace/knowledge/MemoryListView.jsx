'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Brain, Plus, Search } from 'lucide-react';
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
  MEMORY_TYPE_OPTIONS,
  confidenceMeta,
  memoryStatusMeta,
  memoryTypeLabel,
} from './meta';

const LIST_KEYS = ['q', 'memoryType', 'status', 'page'];
const STATUS_CHIPS = ['any', 'active', 'archived', 'superseded'];

function listHref(query, overrides = {}) {
  const merged = { ...query, page: 1, ...overrides };
  const search = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = merged[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    if (key === 'status' && (value === 'any' || value === 'active')) continue;
    if (key === 'memoryType' && value === 'any') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text
    ? `/workspace/memory/memories?${text}`
    : '/workspace/memory/memories';
}

export default function MemoryListView({ result, query, canCreate, timezone }) {
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
        <Title>AI memories</Title>
        <Lead>
          Durable, structured facts supplied to agents: workspace and company
          knowledge, client and project facts, decisions, workflow preferences and
          per-agent memory. Each memory keeps its source, confidence and version
          history.
        </Lead>
      </Header>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Memories</CardTitle>
            <CardText>
              {total} {total === 1 ? 'memory' : 'memories'} match the current
              filters. Showing page {page} of {pages}.
            </CardText>
          </div>
          <Actions>
            {canCreate ? (
              <LinkButton href="/workspace/memory/memories/new" $primary>
                <Plus size={15} />
                New memory
              </LinkButton>
            ) : null}
          </Actions>
        </CardHead>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STATUS_CHIPS.map((status) => (
            <FilterChip
              key={status}
              href={listHref(query, { status })}
              $active={(query.status || 'active') === status}
            >
              {status === 'any' ? 'All statuses' : memoryStatusMeta(status).label}
            </FilterChip>
          ))}
        </div>

        <FilterBar key={JSON.stringify(query)} onSubmit={submitFilters}>
          <input type="hidden" name="status" value={query.status || 'active'} />
          <FilterField>
            <span>Search</span>
            <input
              type="search"
              name="q"
              defaultValue={query.q || ''}
              placeholder="Key or content"
            />
          </FilterField>
          <FilterField>
            <span>Type</span>
            <select name="memoryType" defaultValue={query.memoryType || 'any'}>
              <option value="any">All types</option>
              {MEMORY_TYPE_OPTIONS.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.label}
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
              onClick={() => router.push('/workspace/memory/memories')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <Brain size={17} aria-hidden="true" />
            <div>
              <h3>No memories match these filters</h3>
              <p>
                Memories are explicit, curated facts. Conversations are never
                converted into memory automatically.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Confidence</th>
                  <th>Scope</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((memory) => {
                  const status = memoryStatusMeta(memory.status);
                  const confidence = confidenceMeta(memory.confidence);
                  return (
                    <tr key={memory.id}>
                      <td>
                        <Link href={`/workspace/memory/memories/${memory.id}`}>
                          {memory.key}
                        </Link>
                        <div
                          style={{
                            fontSize: '0.72rem',
                            color: '#64748B',
                            maxWidth: 340,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {memory.content}
                        </div>
                      </td>
                      <td>{memoryTypeLabel(memory.memoryType)}</td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                        {memory.verified ? (
                          <Badge $tone="success">Verified</Badge>
                        ) : null}
                      </td>
                      <td>
                        <Badge $tone={confidence.tone}>{confidence.label}</Badge>
                      </td>
                      <td>
                        {memory.clientName ||
                          memory.projectName ||
                          memory.agentName ||
                          'Workspace-wide'}
                      </td>
                      <td>{formatDateTime(memory.updatedAt, timezone)}</td>
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
