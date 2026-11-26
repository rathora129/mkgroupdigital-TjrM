'use client';

import Link from 'next/link';
import {
  BookOpen,
  FileSearch,
  FileText,
  Brain,
  Plus,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  Actions,
  Badge,
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
import { formatDateTime } from '@/lib/ai/format';
import { MetaGrid, TwoCol } from '@/components/workspace/phase2c/ui';
import {
  categoryLabel,
  documentStatusMeta,
  provenanceMeta,
  statusMeta,
} from './meta';

export default function KnowledgeOverviewView({
  overview,
  timezone,
  canCreate,
  canManageDocuments,
  canCreateMemories,
}) {
  const { entries, documents, categories, activeMemories, chunks } = overview;

  return (
    <Page>
      <Header>
        <Eyebrow>Workspace intelligence</Eyebrow>
        <Title>Memory & knowledge</Title>
        <Lead>
          A single, workspace-scoped store of company knowledge, uploaded
          documents and durable AI memories. Every item keeps its source and a
          provenance label so AI output can be told apart from verified company
          fact.
        </Lead>
      </Header>

      <StatGrid>
        <StatCard>
          <StatLabel>Knowledge entries</StatLabel>
          <StatValue>{entries.total}</StatValue>
          <StatNote>
            {entries.published} published · {entries.draft} draft ·{' '}
            {entries.archived} archived
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Document chunks</StatLabel>
          <StatValue>{chunks}</StatValue>
          <StatNote>
            {documents.processed} processed · {documents.failed} failed ·{' '}
            {documents.processing} processing
          </StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Active memories</StatLabel>
          <StatValue>{activeMemories}</StatValue>
          <StatNote>Durable facts supplied to agents</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Categories in use</StatLabel>
          <StatValue>{categories.length}</StatValue>
          <StatNote>Only published entries reach AI runs</StatNote>
        </StatCard>
      </StatGrid>

      <Actions>
        {canCreate ? (
          <LinkButton href="/workspace/memory/knowledge/new" $primary>
            <Plus size={15} />
            New knowledge entry
          </LinkButton>
        ) : null}
        {canManageDocuments ? (
          <LinkButton href="/workspace/memory/documents">
            <Upload size={15} />
            Upload a document
          </LinkButton>
        ) : null}
        {canCreateMemories ? (
          <LinkButton href="/workspace/memory/memories/new">
            <Brain size={15} />
            Add a memory
          </LinkButton>
        ) : null}
        <LinkButton href="/workspace/memory/search">
          <Search size={15} />
          Search knowledge
        </LinkButton>
      </Actions>

      <TwoCol>
        <Card>
          <CardHead>
            <div>
              <CardTitle>Recent knowledge entries</CardTitle>
              <CardText>The five most recently updated entries.</CardText>
            </div>
            <BookOpen size={16} aria-hidden="true" />
          </CardHead>
          {overview.recentEntries.length === 0 ? (
            <EmptyState>
              <BookOpen size={17} aria-hidden="true" />
              <div>
                <h3>No knowledge recorded yet</h3>
                <p>
                  Start with the company profile, service catalogue and any
                  policy the AI must never contradict.
                </p>
              </div>
            </EmptyState>
          ) : (
            <>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.recentEntries.map((entry) => {
                      const status = statusMeta(entry.status);
                      const provenance = provenanceMeta(entry.provenance);
                      return (
                        <tr key={entry.id}>
                          <td>
                            <Link href={`/workspace/memory/knowledge/${entry.id}`}>
                              {entry.title}
                            </Link>
                            <div style={{ marginTop: 3 }}>
                              <Badge $tone={provenance.tone}>
                                {provenance.label}
                              </Badge>
                            </div>
                          </td>
                          <td>{categoryLabel(entry.category)}</td>
                          <td>
                            <Badge $tone={status.tone}>{status.label}</Badge>
                          </td>
                          <td>{formatDateTime(entry.updatedAt, timezone)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
              <Actions>
                <LinkButton href="/workspace/memory/knowledge">
                  View all knowledge
                </LinkButton>
              </Actions>
            </>
          )}
        </Card>

        <Card>
          <CardHead>
            <div>
              <CardTitle>Recent documents</CardTitle>
              <CardText>Uploaded sources and their processing status.</CardText>
            </div>
            <FileText size={16} aria-hidden="true" />
          </CardHead>
          {overview.recentDocuments.length === 0 ? (
            <EmptyState>
              <FileText size={17} aria-hidden="true" />
              <div>
                <h3>No documents uploaded</h3>
                <p>
                  Plain text, markdown, CSV and JSON files up to 1 MB can be
                  processed. PDF and DOCX are not supported.
                </p>
              </div>
            </EmptyState>
          ) : (
            <>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Status</th>
                      <th>Chunks</th>
                      <th>Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.recentDocuments.map((document) => {
                      const status = documentStatusMeta(document.status);
                      return (
                        <tr key={document.id}>
                          <td>
                            <Link href={`/workspace/memory/documents/${document.id}`}>
                              {document.filename}
                            </Link>
                          </td>
                          <td>
                            <Badge $tone={status.tone}>{status.label}</Badge>
                          </td>
                          <td>{document.chunkCount}</td>
                          <td>{formatDateTime(document.createdAt, timezone)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
              <Actions>
                <LinkButton href="/workspace/memory/documents">
                  View all documents
                </LinkButton>
              </Actions>
            </>
          )}
        </Card>
      </TwoCol>

      <Card>
        <CardHead>
          <div>
            <CardTitle>How the AI uses this</CardTitle>
            <CardText>
              Context is retrieved per run and labelled by provenance. Retrieval
              never grants permissions or approval.
            </CardText>
          </div>
          <Sparkles size={16} aria-hidden="true" />
        </CardHead>
        <MetaGrid>
          <div>
            <dt>Verified</dt>
            <dd>Confirmed by a person as accurate company information.</dd>
          </div>
          <div>
            <dt>Source-derived</dt>
            <dd>Extracted from an uploaded document; not independently verified.</dd>
          </div>
          <div>
            <dt>AI-generated</dt>
            <dd>A summary produced by an agent; treat as unverified until checked.</dd>
          </div>
          <div>
            <dt>Unverified</dt>
            <dd>Recorded for reference only; must not be presented as fact.</dd>
          </div>
        </MetaGrid>
        <Hint>
          Only published knowledge entries and active memories are eligible for AI
          context. Drafts, archived entries and your other workspaces are never
          included.
        </Hint>
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Explore</CardTitle>
            <CardText>Browse the knowledge base by category.</CardText>
          </div>
          <FileSearch size={16} aria-hidden="true" />
        </CardHead>
        <Actions>
          <LinkButton href="/workspace/memory/knowledge">
            Knowledge entries ({entries.active})
          </LinkButton>
          <LinkButton href="/workspace/memory/documents">
            Documents ({documents.total})
          </LinkButton>
          <LinkButton href="/workspace/memory/memories">
            AI memories ({activeMemories})
          </LinkButton>
          <LinkButton href="/workspace/memory/search">
            Search everything
          </LinkButton>
        </Actions>
      </Card>
    </Page>
  );
}
