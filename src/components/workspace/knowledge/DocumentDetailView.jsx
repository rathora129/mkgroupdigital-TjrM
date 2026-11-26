'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Loader2, RefreshCw } from 'lucide-react';
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
  Header,
  Hint,
  Mono,
  Notice,
  Page,
  Pre,
  Row,
  Stack,
  Title,
} from '@/components/workspace/ai/primitives';
import { formatDateTime } from '@/lib/ai/format';
import { MetaGrid } from '@/components/workspace/phase2c/ui';
import {
  categoryLabel,
  documentStatusMeta,
  formatBytes,
  provenanceMeta,
} from './meta';

export default function DocumentDetailView({ detail, canManage, timezone }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [notice, setNotice] = useState(null);
  const { document, entry, chunks } = detail;
  const status = documentStatusMeta(document.status);

  async function retry() {
    setBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      await apiRequest(`/api/workforce/knowledge/documents/${document.id}`, {
        method: 'POST',
      });
      setNotice('Document reprocessed and chunks rebuilt.');
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
        href="/workspace/memory/documents"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>Documents</span>
      </Link>

      <Header>
        <Eyebrow>Knowledge document</Eyebrow>
        <Title>{document.filename}</Title>
        <Row>
          <Badge $tone={status.tone}>{status.label}</Badge>
          <Badge $tone="muted">{document.format}</Badge>
          <Badge $tone="muted">{formatBytes(document.byteSize)}</Badge>
          <Badge $tone="muted">
            {document.chunkCount} {document.chunkCount === 1 ? 'chunk' : 'chunks'}
          </Badge>
        </Row>
      </Header>

      {notice ? <Notice $tone="success">{notice}</Notice> : null}
      {failure ? <Notice $tone="danger">{failure}</Notice> : null}
      {document.status === 'failed' ? (
        <Notice $tone="danger">
          <span>
            Processing failed: {document.errorMessage || 'unknown reason'}. The
            file was stored but no searchable chunks exist, so this document is
            not indexable until it is reprocessed or uploaded again.
          </span>
        </Notice>
      ) : null}

      <Actions>
        {canManage && document.status !== 'processed' ? (
          <Button type="button" onClick={retry} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            Retry processing
          </Button>
        ) : null}
        {entry ? (
          <Link
            href={`/workspace/memory/knowledge/${entry.id}`}
            style={{ fontSize: '0.8rem', fontWeight: 600 }}
          >
            Open linked knowledge entry
          </Link>
        ) : null}
      </Actions>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Document details</CardTitle>
            <CardText>
              Only the extracted, normalised text is retained. The original
              binary file is not stored.
            </CardText>
          </div>
          <FileText size={16} aria-hidden="true" />
        </CardHead>
        <MetaGrid>
          <div>
            <dt>Format</dt>
            <dd>{document.format}</dd>
          </div>
          <div>
            <dt>MIME type</dt>
            <dd>{document.mimeType}</dd>
          </div>
          <div>
            <dt>Document version</dt>
            <dd>v{document.version}</dd>
          </div>
          <div>
            <dt>Uploaded by</dt>
            <dd>{document.uploadedByName || document.uploadedByEmail || 'Unknown'}</dd>
          </div>
          <div>
            <dt>Uploaded</dt>
            <dd>{formatDateTime(document.createdAt, timezone)}</dd>
          </div>
          <div>
            <dt>Processed</dt>
            <dd>{formatDateTime(document.processedAt, timezone)}</dd>
          </div>
          <div>
            <dt>Checksum</dt>
            <dd>
              <Mono>{document.checksum.slice(0, 16)}…</Mono>
            </dd>
          </div>
          <div>
            <dt>Linked entry</dt>
            <dd>{entry ? entry.title : 'None'}</dd>
          </div>
        </MetaGrid>
        {entry ? (
          <Row>
            <Badge $tone="muted">{categoryLabel(entry.category)}</Badge>
            <Badge $tone={provenanceMeta(entry.provenance).tone}>
              {provenanceMeta(entry.provenance).label}
            </Badge>
          </Row>
        ) : null}
      </Card>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Searchable chunks</CardTitle>
            <CardText>
              Chunks keep their nearest heading and a source reference so an AI
              answer can cite where it came from.
            </CardText>
          </div>
        </CardHead>
        {chunks.length === 0 ? (
          <EmptyState>
            <FileText size={17} aria-hidden="true" />
            <div>
              <h3>No chunks were created</h3>
              <p>
                {document.status === 'failed'
                  ? 'Reprocess the document to create searchable chunks.'
                  : 'This document has not been processed yet.'}
              </p>
            </div>
          </EmptyState>
        ) : (
          <Stack $gap={12}>
            {chunks.map((chunk) => (
              <div key={chunk.id}>
                <Row>
                  <Badge $tone="muted">Chunk {chunk.chunkIndex + 1}</Badge>
                  {chunk.heading ? (
                    <strong style={{ fontSize: '0.8rem' }}>{chunk.heading}</strong>
                  ) : null}
                  <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                    {chunk.charCount} chars · ~{chunk.tokenEstimate} tokens
                  </span>
                </Row>
                <Pre>{chunk.content}</Pre>
              </div>
            ))}
          </Stack>
        )}
        {chunks.length === 100 ? (
          <Hint>Showing the first 100 chunks of this document.</Hint>
        ) : null}
      </Card>
    </Page>
  );
}
