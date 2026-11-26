'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, RefreshCw, Search, Upload } from 'lucide-react';
import {
  Actions,
  Badge,
  Button,
  Card,
  CardHead,
  CardText,
  CardTitle,
  EmptyState,
  ErrorText,
  Eyebrow,
  Field,
  Grid,
  Header,
  Hint,
  Input,
  Label,
  Lead,
  Notice,
  Page,
  Select,
  Stack,
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
  documentStatusMeta,
  formatBytes,
  tagsFromText,
} from './meta';

const LIST_KEYS = ['q', 'status', 'page'];
const STATUS_CHIPS = ['any', 'processed', 'failed', 'processing'];
const MAX_BYTES = 1024 * 1024;

function listHref(query, overrides = {}) {
  const merged = { ...query, page: 1, ...overrides };
  const search = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = merged[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    if (key === 'status' && value === 'any') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text
    ? `/workspace/memory/documents?${text}`
    : '/workspace/memory/documents';
}

const EMPTY_UPLOAD = {
  title: '',
  category: 'reference',
  provenance: 'source_derived',
  status: 'published',
  tags: '',
  clientId: '',
  projectId: '',
};

export default function DocumentsView({
  result,
  query,
  scopeOptions,
  canManage,
  timezone,
}) {
  const router = useRouter();
  const fileInput = useRef(null);
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState(EMPTY_UPLOAD);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [failure, setFailure] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [retryingId, setRetryingId] = useState(null);

  const { items, total, page, pages, pageSize } = result;

  function updateMeta(event) {
    const { name, value } = event.target;
    setMeta((current) => ({ ...current, [name]: value }));
  }

  async function upload(event) {
    event.preventDefault();
    setFailure(null);
    setNotice(null);
    setFieldErrors({});
    if (!file) {
      setFieldErrors({ file: 'Choose a file to upload.' });
      return;
    }
    if (file.size > MAX_BYTES) {
      setFieldErrors({ file: 'Choose a file smaller than 1 MB.' });
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('title', meta.title);
      body.append('category', meta.category);
      body.append('provenance', meta.provenance);
      body.append('status', meta.status);
      body.append('tags', JSON.stringify(tagsFromText(meta.tags)));
      if (meta.clientId) body.append('clientId', meta.clientId);
      if (meta.projectId) body.append('projectId', meta.projectId);

      const response = await fetch('/api/workforce/knowledge/documents', {
        method: 'POST',
        body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(
          payload?.error?.message || 'The document could not be uploaded.',
        );
        error.details = payload?.error?.details || null;
        throw error;
      }
      const data = payload?.data;
      if (data?.duplicate) {
        setNotice('That exact file was already uploaded. The existing record was reused.');
      } else if (data?.duplicateKnowledge) {
        setNotice(
          'The file was processed and linked to an identical knowledge entry that already existed.',
        );
      } else {
        setNotice(
          `Processed ${data?.document?.filename || 'document'} into ${
            data?.document?.chunkCount ?? 0
          } searchable chunks.`,
        );
      }
      setFile(null);
      setMeta(EMPTY_UPLOAD);
      if (fileInput.current) fileInput.current.value = '';
      router.refresh();
    } catch (error) {
      setFailure(error.message);
      if (error.details) setFieldErrors(error.details);
    } finally {
      setUploading(false);
    }
  }

  async function retry(documentId) {
    setRetryingId(documentId);
    setFailure(null);
    setNotice(null);
    try {
      await fetch(`/api/workforce/knowledge/documents/${documentId}`, {
        method: 'POST',
      }).then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            payload?.error?.message || 'Processing could not be retried.',
          );
        }
      });
      setNotice('Document reprocessed.');
      router.refresh();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setRetryingId(null);
    }
  }

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
        <Title>Knowledge documents</Title>
        <Lead>
          Upload plain-text sources, extract and normalise the text, split it
          into searchable chunks and link the result to a knowledge entry. Files
          that cannot be decoded are reported as failed, never as indexed.
        </Lead>
      </Header>

      {notice ? <Notice $tone="success">{notice}</Notice> : null}
      {failure ? <Notice $tone="danger">{failure}</Notice> : null}

      {canManage ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>Upload a document</CardTitle>
              <CardText>
                Supported: .txt, .md, .markdown, .csv and .json up to 1 MB. PDF
                and DOCX are not supported in this build.
              </CardText>
            </div>
            <Upload size={16} aria-hidden="true" />
          </CardHead>
          <form onSubmit={upload}>
            <Stack $gap={14}>
              <Field>
                <Label htmlFor="doc-file">File</Label>
                <input
                  id="doc-file"
                  ref={fileInput}
                  type="file"
                  accept=".txt,.md,.markdown,.csv,.json,text/plain,text/markdown,text/csv,application/json"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  disabled={uploading}
                />
                {fieldErrors.file ? (
                  <ErrorText>{fieldErrors.file}</ErrorText>
                ) : (
                  <Hint>
                    {file
                      ? `${file.name} · ${formatBytes(file.size)}`
                      : 'Choose a file to upload.'}
                  </Hint>
                )}
              </Field>

              <Grid $cols={2}>
                <Field>
                  <Label htmlFor="doc-title">Title (optional)</Label>
                  <Input
                    id="doc-title"
                    name="title"
                    value={meta.title}
                    onChange={updateMeta}
                    disabled={uploading}
                  />
                  <Hint>Defaults to the first heading or first line.</Hint>
                </Field>
                <Field>
                  <Label htmlFor="doc-category">Category</Label>
                  <Select
                    id="doc-category"
                    name="category"
                    value={meta.category}
                    onChange={updateMeta}
                    disabled={uploading}
                  >
                    {CATEGORY_OPTIONS.map((category) => (
                      <option key={category.key} value={category.key}>
                        {category.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label htmlFor="doc-provenance">Provenance</Label>
                  <Select
                    id="doc-provenance"
                    name="provenance"
                    value={meta.provenance}
                    onChange={updateMeta}
                    disabled={uploading}
                  >
                    <option value="source_derived">Source-derived</option>
                    <option value="verified">Verified</option>
                    <option value="unverified">Unverified</option>
                  </Select>
                </Field>
                <Field>
                  <Label htmlFor="doc-status">Entry status</Label>
                  <Select
                    id="doc-status"
                    name="status"
                    value={meta.status}
                    onChange={updateMeta}
                    disabled={uploading}
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </Select>
                </Field>
                <Field>
                  <Label htmlFor="doc-client">Client scope</Label>
                  <Select
                    id="doc-client"
                    name="clientId"
                    value={meta.clientId}
                    onChange={updateMeta}
                    disabled={uploading}
                  >
                    <option value="">Workspace-wide</option>
                    {scopeOptions.clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.companyName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label htmlFor="doc-project">Project scope</Label>
                  <Select
                    id="doc-project"
                    name="projectId"
                    value={meta.projectId}
                    onChange={updateMeta}
                    disabled={uploading}
                  >
                    <option value="">Workspace-wide</option>
                    {scopeOptions.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </Grid>

              <Field>
                <Label htmlFor="doc-tags">Tags</Label>
                <Input
                  id="doc-tags"
                  name="tags"
                  value={meta.tags}
                  onChange={updateMeta}
                  placeholder="comma, separated, tags"
                  disabled={uploading}
                />
              </Field>

              <Actions>
                <Button type="submit" $primary disabled={uploading}>
                  {uploading ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  Upload and process
                </Button>
              </Actions>
            </Stack>
          </form>
        </Card>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Documents</CardTitle>
            <CardText>
              {total} {total === 1 ? 'document' : 'documents'} match the current
              filters. Showing page {page} of {pages}.
            </CardText>
          </div>
        </CardHead>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STATUS_CHIPS.map((status) => (
            <FilterChip
              key={status}
              href={listHref(query, { status })}
              $active={(query.status || 'any') === status}
            >
              {status === 'any' ? 'All statuses' : documentStatusMeta(status).label}
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
              placeholder="Filename"
            />
          </FilterField>
          <Actions>
            <Button type="submit">
              <Search size={14} />
              Apply
            </Button>
            <Button
              type="button"
              $variant="ghost"
              onClick={() => router.push('/workspace/memory/documents')}
            >
              Reset
            </Button>
          </Actions>
        </FilterBar>

        {items.length === 0 ? (
          <EmptyState>
            <FileText size={17} aria-hidden="true" />
            <div>
              <h3>No documents match these filters</h3>
              <p>
                Uploaded sources become searchable chunks that AI runs can cite
                by document and chunk number.
              </p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Status</th>
                  <th>Chunks</th>
                  <th>Size</th>
                  <th>Knowledge entry</th>
                  <th>Uploaded</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((document) => {
                  const status = documentStatusMeta(document.status);
                  return (
                    <tr key={document.id}>
                      <td>
                        <Link href={`/workspace/memory/documents/${document.id}`}>
                          {document.filename}
                        </Link>
                        {document.errorMessage ? (
                          <div style={{ fontSize: '0.72rem', color: '#B91C1C' }}>
                            {document.errorMessage}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>{document.chunkCount}</td>
                      <td>{formatBytes(document.byteSize)}</td>
                      <td>
                        {document.entryTitle ? (
                          <Link
                            href={`/workspace/memory/knowledge/${document.entryId}`}
                          >
                            {document.entryTitle}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{formatDateTime(document.createdAt, timezone)}</td>
                      <td>
                        {canManage && document.status === 'failed' ? (
                          <Button
                            type="button"
                            $variant="ghost"
                            onClick={() => retry(document.id)}
                            disabled={retryingId === document.id}
                          >
                            {retryingId === document.id ? (
                              <Loader2 size={13} className="spin" />
                            ) : (
                              <RefreshCw size={13} />
                            )}
                            Retry
                          </Button>
                        ) : null}
                      </td>
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
