'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Pencil,
  RotateCcw,
  Send,
} from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import {
  Actions,
  Badge,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  Divider,
  Eyebrow,
  Header,
  Hint,
  Mono,
  Notice,
  Page,
  Pre,
  Row,
  Stack,
  Table,
  TableWrap,
  Title,
} from '@/components/workspace/ai/primitives';
import { formatDateTime } from '@/lib/ai/format';
import { MetaGrid } from '@/components/workspace/phase2c/ui';
import {
  categoryLabel,
  provenanceMeta,
  sourceLabel,
  statusMeta,
} from './meta';
import KnowledgeEntryForm from './KnowledgeEntryForm';

export default function KnowledgeDetailView({
  detail,
  versions,
  scopeOptions,
  canUpdate,
  canArchive,
  timezone,
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const { entry, documents, chunkCount, linkedMemories } = detail;
  const status = statusMeta(entry.status);
  const provenance = provenanceMeta(entry.provenance);

  async function changeStatus(nextStatus) {
    setBusy(true);
    setFailure(null);
    try {
      await apiRequest(`/api/workforce/knowledge/${entry.id}`, {
        method: 'PATCH',
        body: { status: nextStatus, expectedVersion: entry.version },
      });
      router.refresh();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Link
        href="/workspace/memory/knowledge"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>
          Knowledge base
        </span>
      </Link>

      <Header>
        <Eyebrow>{categoryLabel(entry.category)}</Eyebrow>
        <Title>{entry.title}</Title>
        <Row>
          <Badge $tone={status.tone}>{status.label}</Badge>
          <Badge $tone={provenance.tone}>{provenance.label}</Badge>
          <Badge $tone="muted">v{entry.version}</Badge>
          {entry.clientName || entry.projectName ? (
            <Badge $tone="muted">
              Scope: {[entry.clientName, entry.projectName].filter(Boolean).join(' · ')}
            </Badge>
          ) : (
            <Badge $tone="muted">Workspace-wide</Badge>
          )}
        </Row>
      </Header>

      {failure ? <Notice $tone="danger">{failure}</Notice> : null}

      <Actions>
        {canUpdate ? (
          <Button
            type="button"
            $variant="ghost"
            onClick={() => setEditing((value) => !value)}
            disabled={busy}
          >
            <Pencil size={14} />
            {editing ? 'Close editor' : 'Edit'}
          </Button>
        ) : null}
        {canUpdate && entry.status === 'draft' ? (
          <Button
            type="button"
            onClick={() => changeStatus('published')}
            disabled={busy}
          >
            {busy ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
            Publish
          </Button>
        ) : null}
        {canUpdate && entry.status === 'published' ? (
          <Button
            type="button"
            $variant="ghost"
            onClick={() => changeStatus('draft')}
            disabled={busy}
          >
            <CheckCircle2 size={14} />
            Move to draft
          </Button>
        ) : null}
        {canArchive && entry.status !== 'archived' ? (
          <Button
            type="button"
            $variant="danger"
            onClick={() => changeStatus('archived')}
            disabled={busy}
          >
            <Archive size={14} />
            Archive
          </Button>
        ) : null}
        {canArchive && entry.status === 'archived' ? (
          <Button
            type="button"
            onClick={() => changeStatus('draft')}
            disabled={busy}
          >
            <RotateCcw size={14} />
            Restore to draft
          </Button>
        ) : null}
      </Actions>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Entry</CardTitle>
            <CardText>{provenance.description}</CardText>
          </div>
        </CardHead>
        <MetaGrid>
          <div>
            <dt>Category</dt>
            <dd>{categoryLabel(entry.category)}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              {sourceLabel(entry.sourceType)}
              {entry.sourceReference ? ` · ${entry.sourceReference}` : ''}
            </dd>
          </div>
          <div>
            <dt>Created by</dt>
            <dd>{entry.createdByName || entry.createdByEmail || 'Unknown'}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatDateTime(entry.createdAt, timezone)}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>{formatDateTime(entry.updatedAt, timezone)}</dd>
          </div>
          <div>
            <dt>Published</dt>
            <dd>{formatDateTime(entry.publishedAt, timezone)}</dd>
          </div>
          <div>
            <dt>Document chunks</dt>
            <dd>{chunkCount}</dd>
          </div>
          <div>
            <dt>Linked memories</dt>
            <dd>{linkedMemories}</dd>
          </div>
        </MetaGrid>
        {Array.isArray(entry.tags) && entry.tags.length ? (
          <Row>
            {entry.tags.map((tag) => (
              <Badge key={tag} $tone="muted">
                {tag}
              </Badge>
            ))}
          </Row>
        ) : null}
        {entry.summary ? (
          <Hint>
            <strong>Summary:</strong> {entry.summary}
          </Hint>
        ) : null}
        <Divider />
        <Pre>{entry.content}</Pre>
      </Card>

      {editing && canUpdate ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Edit entry</CardTitle>
              <CardText>
                Saving creates version {entry.version + 1} and keeps the previous
                version in history.
              </CardText>
            </div>
          </CardHead>
          <KnowledgeEntryForm
            mode="edit"
            entry={entry}
            scopeOptions={scopeOptions}
            onCancel={() => setEditing(false)}
          />
        </Card>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Version history</CardTitle>
            <CardText>
              {versions.total} {versions.total === 1 ? 'version' : 'versions'} of
              this entry.
            </CardText>
          </div>
        </CardHead>
        {versions.items.length === 0 ? (
          <Hint>No versions have been recorded.</Hint>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Provenance</th>
                  <th>Changed by</th>
                  <th>Note</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {versions.items.map((version) => {
                  const versionStatus = statusMeta(version.status);
                  const versionProvenance = provenanceMeta(version.provenance);
                  return (
                    <tr key={version.id}>
                      <td>
                        <Mono>v{version.version}</Mono>
                      </td>
                      <td>
                        <Badge $tone={versionStatus.tone}>
                          {versionStatus.label}
                        </Badge>
                      </td>
                      <td>
                        <Badge $tone={versionProvenance.tone}>
                          {versionProvenance.label}
                        </Badge>
                      </td>
                      <td>{version.changedByName || version.changedByEmail || 'System'}</td>
                      <td>{version.changeNote || '—'}</td>
                      <td>{formatDateTime(version.createdAt, timezone)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Source documents</CardTitle>
            <CardText>
              Uploaded files that produced or are linked to this entry.
            </CardText>
          </div>
        </CardHead>
        {documents.length === 0 ? (
          <Hint>This entry was not created from an uploaded document.</Hint>
        ) : (
          <Stack $gap={8}>
            {documents.map((document) => (
              <Row key={document.id}>
                <Link href={`/workspace/memory/documents/${document.id}`}>
                  {document.filename}
                </Link>
                <Badge $tone={document.status === 'failed' ? 'danger' : 'muted'}>
                  {document.status}
                </Badge>
                <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                  {document.chunkCount} chunks ·{' '}
                  {formatDateTime(document.createdAt, timezone)}
                </span>
              </Row>
            ))}
          </Stack>
        )}
      </Card>
    </Page>
  );
}
