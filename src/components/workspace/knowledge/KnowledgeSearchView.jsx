'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileSearch, Search } from 'lucide-react';
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
  Pre,
  Stack,
  Title,
} from '@/components/workspace/ai/primitives';
import {
  FilterBar,
  FilterField,
  MetaGrid,
} from '@/components/workspace/phase2c/ui';
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  provenanceMeta,
} from './meta';

export default function KnowledgeSearchView({ query, results, scopeOptions }) {
  const router = useRouter();

  function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const key of ['q', 'category', 'clientId', 'projectId']) {
      const value = String(data.get(key) ?? '').trim();
      if (value && !(key === 'category' && value === 'any')) {
        params.set(key, value);
      }
    }
    const text = params.toString();
    router.push(text ? `/workspace/memory/search?${text}` : '/workspace/memory/search');
  }

  const entries = results?.entries || [];
  const chunks = results?.chunks || [];
  const hasQuery = Boolean(query.q);

  return (
    <Page>
      <Header>
        <Eyebrow>Memory & knowledge</Eyebrow>
        <Title>Search knowledge</Title>
        <Lead>
          Lexical search over published and draft knowledge entries and document
          chunks. Results always show their provenance so a summary is never
          mistaken for a verified fact.
        </Lead>
      </Header>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Search</CardTitle>
            <CardText>Match title, summary, content, tags and chunks.</CardText>
          </div>
          <FileSearch size={16} aria-hidden="true" />
        </CardHead>
        <FilterBar key={JSON.stringify(query)} onSubmit={submit}>
          <FilterField>
            <span>Search term</span>
            <input
              type="search"
              name="q"
              defaultValue={query.q || ''}
              placeholder="At least two characters"
              autoFocus
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
            <span>Client</span>
            <select name="clientId" defaultValue={query.clientId || ''}>
              <option value="">Any client</option>
              {scopeOptions.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField>
            <span>Project</span>
            <select name="projectId" defaultValue={query.projectId || ''}>
              <option value="">Any project</option>
              {scopeOptions.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </FilterField>
          <Actions>
            <Button type="submit">
              <Search size={14} />
              Search
            </Button>
          </Actions>
        </FilterBar>
      </Card>

      {!hasQuery ? (
        <EmptyState>
          <FileSearch size={17} aria-hidden="true" />
          <div>
            <h3>Enter a search term</h3>
            <p>
              Search is lexical and workspace-scoped. It never crosses into another
              workspace and never changes permissions.
            </p>
          </div>
        </EmptyState>
      ) : results?.reason === 'permission' ? (
        <Hint>Your role does not allow viewing workspace knowledge.</Hint>
      ) : results ? (
        <>
          <Card>
            <CardHead>
              <div>
                <CardTitle>Knowledge entries</CardTitle>
                <CardText>
                  {entries.length} matching{' '}
                  {entries.length === 1 ? 'entry' : 'entries'} for “{query.q}”.
                </CardText>
              </div>
            </CardHead>
            {entries.length === 0 ? (
              <Hint>No knowledge entries matched.</Hint>
            ) : (
              <Stack $gap={12}>
                {entries.map((entry) => {
                  const provenance = provenanceMeta(entry.provenance);
                  return (
                    <div key={entry.id}>
                      <Actions>
                        <Link href={`/workspace/memory/knowledge/${entry.id}`}>
                          {entry.title}
                        </Link>
                        <Badge $tone={provenance.tone}>{provenance.label}</Badge>
                        <Badge $tone="muted">{categoryLabel(entry.category)}</Badge>
                        {entry.sourceReference ? (
                          <Badge $tone="muted">{entry.sourceReference}</Badge>
                        ) : null}
                      </Actions>
                      <Hint>{entry.excerpt}</Hint>
                    </div>
                  );
                })}
              </Stack>
            )}
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Document chunks</CardTitle>
                <CardText>
                  {chunks.length} matching{' '}
                  {chunks.length === 1 ? 'chunk' : 'chunks'}. Each keeps its
                  document and heading reference.
                </CardText>
              </div>
            </CardHead>
            {chunks.length === 0 ? (
              <Hint>No document chunks matched.</Hint>
            ) : (
              <Stack $gap={12}>
                {chunks.map((chunk) => {
                  const provenance = provenanceMeta(chunk.provenance);
                  return (
                    <div key={chunk.id}>
                      <Actions>
                        <Link href={`/workspace/memory/knowledge/${chunk.entryId}`}>
                          {chunk.entryTitle}
                        </Link>
                        <Badge $tone="muted">Chunk {chunk.chunkIndex + 1}</Badge>
                        {chunk.heading ? (
                          <Badge $tone="muted">{chunk.heading}</Badge>
                        ) : null}
                        <Badge $tone={provenance.tone}>{provenance.label}</Badge>
                      </Actions>
                      <Pre>{chunk.text}</Pre>
                    </div>
                  );
                })}
              </Stack>
            )}
          </Card>

          <Card>
            <CardHead>
              <div>
                <CardTitle>Ranking</CardTitle>
                <CardText>
                  Results are ranked by PostgreSQL full-text relevance, with an
                  ILIKE fallback for short or punctuation-heavy terms.
                </CardText>
              </div>
            </CardHead>
            <MetaGrid>
              <div>
                <dt>Entries scanned</dt>
                <dd>{entries.length}</dd>
              </div>
              <div>
                <dt>Chunks scanned</dt>
                <dd>{chunks.length}</dd>
              </div>
              <div>
                <dt>Workspace</dt>
                <dd>Current workspace only</dd>
              </div>
              <div>
                <dt>Permissions</dt>
                <dd>Unchanged by retrieval</dd>
              </div>
            </MetaGrid>
          </Card>
        </>
      ) : null}
    </Page>
  );
}
