'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Archive,
  ArrowLeft,
  Loader2,
  Pencil,
  RotateCcw,
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
  Eyebrow,
  Header,
  Hint,
  Mono,
  Notice,
  Page,
  Pre,
  Row,
  Table,
  TableWrap,
  Title,
} from '@/components/workspace/ai/primitives';
import { formatDateTime } from '@/lib/ai/format';
import { MetaGrid } from '@/components/workspace/phase2c/ui';
import {
  confidenceMeta,
  memoryStatusMeta,
  memoryTypeLabel,
} from './meta';
import MemoryForm from './MemoryForm';

export default function MemoryDetailView({
  detail,
  versions,
  scopeOptions,
  canUpdate,
  timezone,
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const { memory } = detail;
  const status = memoryStatusMeta(memory.status);
  const confidence = confidenceMeta(memory.confidence);

  async function changeStatus(nextStatus) {
    setBusy(true);
    setFailure(null);
    try {
      await apiRequest(`/api/workforce/memories/${memory.id}`, {
        method: 'PATCH',
        body: { status: nextStatus, expectedVersion: memory.version },
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
        href="/workspace/memory/memories"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <ArrowLeft size={14} aria-hidden="true" />
        <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>AI memories</span>
      </Link>

      <Header>
        <Eyebrow>{memoryTypeLabel(memory.memoryType)} memory</Eyebrow>
        <Title>{memory.key}</Title>
        <Row>
          <Badge $tone={status.tone}>{status.label}</Badge>
          <Badge $tone={confidence.tone}>{confidence.label}</Badge>
          <Badge $tone={memory.verified ? 'success' : 'warning'}>
            {memory.verified ? 'Verified' : 'Unverified'}
          </Badge>
          <Badge $tone="muted">v{memory.version}</Badge>
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
        {canUpdate && memory.status !== 'archived' ? (
          <Button
            type="button"
            $variant="danger"
            onClick={() => changeStatus('archived')}
            disabled={busy}
          >
            {busy ? <Loader2 size={14} className="spin" /> : <Archive size={14} />}
            Archive
          </Button>
        ) : null}
        {canUpdate && memory.status === 'archived' ? (
          <Button
            type="button"
            onClick={() => changeStatus('active')}
            disabled={busy}
          >
            <RotateCcw size={14} />
            Restore
          </Button>
        ) : null}
      </Actions>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Memory</CardTitle>
            <CardText>
              Supplied to matching AI runs as reference data. A memory never
              authorises an action.
            </CardText>
          </div>
        </CardHead>
        <MetaGrid>
          <div>
            <dt>Type</dt>
            <dd>{memoryTypeLabel(memory.memoryType)}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>{confidence.label}</dd>
          </div>
          <div>
            <dt>Verification</dt>
            <dd>{memory.verified ? 'Verified by a person' : 'Not verified'}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{memory.sourceReference || 'No external source recorded'}</dd>
          </div>
          {memory.sourceEntryId ? (
            <div>
              <dt>Knowledge entry</dt>
              <dd>
                <Link href={`/workspace/memory/knowledge/${memory.sourceEntryId}`}>
                  {memory.sourceEntryTitle || 'Open entry'}
                </Link>
              </dd>
            </div>
          ) : null}
          {memory.clientId ? (
            <div>
              <dt>Client</dt>
              <dd>
                <Link href={`/workspace/clients/${memory.clientId}`}>
                  {memory.clientName || 'Client'}
                </Link>
              </dd>
            </div>
          ) : null}
          {memory.projectId ? (
            <div>
              <dt>Project</dt>
              <dd>
                <Link href={`/workspace/projects/${memory.projectId}`}>
                  {memory.projectName || 'Project'}
                </Link>
              </dd>
            </div>
          ) : null}
          {memory.agentId ? (
            <div>
              <dt>Agent</dt>
              <dd>{memory.agentName || 'Agent'}</dd>
            </div>
          ) : null}
          <div>
            <dt>Created by</dt>
            <dd>{memory.createdByName || memory.createdByEmail || 'Unknown'}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatDateTime(memory.createdAt, timezone)}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>{formatDateTime(memory.updatedAt, timezone)}</dd>
          </div>
          <div>
            <dt>Versions</dt>
            <dd>{detail.versionCount}</dd>
          </div>
        </MetaGrid>
        <Pre>{memory.content}</Pre>
      </Card>

      {editing && canUpdate ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Edit memory</CardTitle>
              <CardText>
                Saving creates version {memory.version + 1}. Scope and type stay
                fixed; create a new memory to change them.
              </CardText>
            </div>
          </CardHead>
          <MemoryForm
            mode="edit"
            memory={memory}
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
              this memory.
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
                  <th>Confidence</th>
                  <th>Verified</th>
                  <th>Changed by</th>
                  <th>Note</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {versions.items.map((version) => {
                  const versionStatus = memoryStatusMeta(version.status);
                  const versionConfidence = confidenceMeta(version.confidence);
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
                        <Badge $tone={versionConfidence.tone}>
                          {versionConfidence.label}
                        </Badge>
                      </td>
                      <td>{version.verified ? 'Yes' : 'No'}</td>
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
    </Page>
  );
}
