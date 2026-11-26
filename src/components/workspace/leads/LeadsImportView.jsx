'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  CircleAlert,
  ClipboardPaste,
  FileText,
  Loader2,
  Save,
  Upload,
  X,
} from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import { formatDateTime } from '@/lib/ai/format';
import {
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
} from '@/lib/leads/import-fields';
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
  Field,
  Grid,
  Header,
  Hint,
  Input,
  Label,
  Lead,
  LinkButton,
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

const ROW_STATUS = {
  valid: { label: 'Ready', tone: 'success' },
  duplicate: { label: 'Possible duplicate', tone: 'warning' },
  invalid: { label: 'Needs fixing', tone: 'danger' },
  imported: { label: 'Imported', tone: 'success' },
  pending: { label: 'Pending', tone: 'muted' },
};

const BATCH_STATUS = {
  preview: { label: 'Preview', tone: 'warning' },
  committed: { label: 'Committed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

const LONG_FIELDS = new Set([
  'requirementsInitial',
  'requirementsDetailed',
  'callStatus',
]);

function toneFor(map, status) {
  return map[status] || { label: status, tone: 'muted' };
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

export default function LeadsImportView({ batches, overview, timezone }) {
  const router = useRouter();
  const fileRef = useRef(null);

  const [text, setText] = useState('');
  const [fileName, setFileName] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [errorBatchId, setErrorBatchId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null);
  const [rowError, setRowError] = useState(null);

  const batchLocked = !preview || preview.batch.status !== 'preview';
  const repeated = Boolean(preview?.repeatedImport);

  function clearMessages() {
    setError(null);
    setErrorBatchId(null);
    setNotice(null);
    setRowError(null);
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 1_000_000) {
      setError('That file is too large. Import at most 1 MB of text at a time.');
      return;
    }
    setBusy('file');
    clearMessages();
    try {
      const content = await file.text();
      setText(content);
      setFileName(file.name);
      setPreview(null);
      setEditing(null);
    } catch {
      setError('That file could not be read. Copy the rows and paste them instead.');
    } finally {
      setBusy(null);
    }
  }

  async function runPreview() {
    setBusy('preview');
    clearMessages();
    try {
      const result = await apiRequest('/api/workforce/leads/import', {
        method: 'POST',
        body: {
          text,
          source: fileName ? 'file' : 'paste',
          fileName: fileName || null,
        },
      });
      setPreview(result);
      setNeedsRepeat(false);
      setConfirmRepeat(false);
      setEditing(null);
      setNotice(
        `Preview ready: ${result.totals.valid} ready, ${result.totals.invalid} need fixes, ${result.totals.duplicates} possible duplicates.`,
      );
      router.refresh();
    } catch (err) {
      if (err.code === 'VALIDATION_FAILED' && err.details) {
        const first = Object.values(err.details)[0];
        setError(first || err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(null);
    }
  }

  function startEdit(row) {
    setEditing({ rowId: row.id, values: { ...row.raw } });
    setRowError(null);
  }

  function setEditValue(field, value) {
    setEditing((current) => ({
      ...current,
      values: { ...current.values, [field]: value },
    }));
  }

  async function saveCorrection() {
    if (!editing) return;
    setBusy(`save:${editing.rowId}`);
    clearMessages();
    try {
      const result = await apiRequest(
        `/api/workforce/leads/import/${preview.batch.id}`,
        {
          method: 'PATCH',
          body: {
            corrections: [{ rowId: editing.rowId, values: editing.values }],
          },
        },
      );
      setPreview((current) => ({ ...current, ...result }));
      setEditing(null);
      setNotice('Row saved and re-checked.');
      router.refresh();
    } catch (err) {
      setRowError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    setBusy('commit');
    clearMessages();
    try {
      const result = await apiRequest(
        `/api/workforce/leads/import/${preview.batch.id}/commit`,
        {
          method: 'POST',
          body: {},
        },
      );
      setPreview((current) => ({ ...current, ...result }));
      setNotice(
        `Imported ${result.importedCount} ${
          result.importedCount === 1 ? 'lead' : 'leads'
        } into the native pipeline.`,
      );
      router.refresh();
    } catch (err) {
      if (err.code === 'REPEATED_IMPORT') {
        setErrorBatchId(err.details?.previousBatchId || null);
        setError(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(null);
    }
  }

  async function cancelBatch() {
    setBusy('cancel');
    clearMessages();
    try {
      const result = await apiRequest(
        `/api/workforce/leads/import/${preview.batch.id}/cancel`,
        { method: 'POST' },
      );
      setPreview((current) => ({ ...current, ...result }));
      setNotice('Import cancelled. No leads were created.');
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function openBatch(batchId) {
    setBusy(`open:${batchId}`);
    clearMessages();
    try {
      const result = await apiRequest(
        `/api/workforce/leads/import/${batchId}`,
      );
      setPreview(result);
      setEditing(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  function resetPaste() {
    setText('');
    setFileName(null);
    setPreview(null);
    setEditing(null);
    clearMessages();
  }

  const totals = preview?.totals || null;
  const canCommit =
    !batchLocked &&
    !busy &&
    !repeated &&
    totals?.valid > 0;

  return (
    <Page>
      <Header>
        <Eyebrow>Leads · Owner import</Eyebrow>
        <Title>Paste and import business data</Title>
        <Lead>
          Paste rows copied from a spreadsheet, or open a CSV/TSV file. Columns
          are mapped into the native lead model, every row is validated, and a
          preview is created before anything is saved. Possible duplicates are
          flagged and never merged automatically.
        </Lead>
        <Actions>
          <LinkButton href="/workspace/leads">
            <X size={15} />
            Back to leads
          </LinkButton>
        </Actions>
      </Header>

      {notice ? (
        <Notice $tone="success">
          <BadgeCheck size={15} />
          <span>{notice}</span>
        </Notice>
      ) : null}
      {error ? (
        <Notice $tone="danger">
          <CircleAlert size={15} />
          <div>
            <span>{error}</span>
            {errorBatchId ? (
              <div style={{ marginTop: 6 }}>
                <Button
                  type="button"
                  $variant="ghost"
                  onClick={() => openBatch(errorBatchId)}
                  disabled={Boolean(busy)}
                >
                  Open the previously committed batch
                </Button>
              </div>
            ) : null}
          </div>
        </Notice>
      ) : null}

      <StatGrid>
        <StatCard>
          <StatLabel>Import batches</StatLabel>
          <StatValue>{formatCount(overview.batches)}</StatValue>
          <StatNote>{formatCount(overview.previews)} awaiting review</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Committed batches</StatLabel>
          <StatValue>{formatCount(overview.committed)}</StatValue>
          <StatNote>{formatCount(overview.cancelled)} cancelled</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Leads imported</StatLabel>
          <StatValue>{formatCount(overview.importedLeads)}</StatValue>
          <StatNote>Across committed batches</StatNote>
        </StatCard>
        <StatCard>
          <StatLabel>Preview status</StatLabel>
          <StatValue>
            {totals ? formatCount(totals.valid) : '—'}
          </StatValue>
          <StatNote>
            {totals
              ? `${formatCount(totals.invalid)} invalid · ${formatCount(
                  totals.duplicates,
                )} duplicates`
              : 'Paste data to validate rows'}
          </StatNote>
        </StatCard>
      </StatGrid>

      <Card>
        <CardHead>
          <div>
            <CardTitle>Owner spreadsheet</CardTitle>
            <CardText>
              Expected columns: {IMPORT_FIELDS.map((field) => IMPORT_FIELD_LABELS[field]).join(', ')}.
              Missing or blank columns are allowed. TSV, CSV and Markdown tables
              are detected automatically.
            </CardText>
          </div>
        </CardHead>

        <Field>
          <Label htmlFor="import-text">Paste spreadsheet rows</Label>
          <Textarea
            id="import-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              'Company Name\tContact Number\tOwner / Contact Person\tInitial Requirement\tWebsite\t…'
            }
            style={{ minHeight: 180, fontFamily: 'monospace', fontSize: '0.78rem' }}
            disabled={Boolean(busy)}
          />
          <Hint>
            The first row is treated as the header when at least three known
            columns are recognised. Otherwise the 15 columns are read in order.
          </Hint>
        </Field>

        <Actions>
          <Button
            type="button"
            $variant="primary"
            onClick={runPreview}
            disabled={Boolean(busy) || text.trim() === ''}
          >
            {busy === 'preview' ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <ClipboardPaste size={15} />
            )}
            {busy === 'preview' ? 'Validating…' : 'Preview import'}
          </Button>

          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={Boolean(busy)}
          >
            {busy === 'file' ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <FileText size={15} />
            )}
            Open CSV / TSV file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,.md,text/csv,text/tab-separated-values,text/plain,text/markdown"
            onChange={handleFile}
            hidden
          />

          <Button
            type="button"
            $variant="ghost"
            onClick={resetPaste}
            disabled={Boolean(busy)}
          >
            <X size={15} />
            Clear
          </Button>
          {fileName ? <Hint>Loaded from {fileName}</Hint> : null}
        </Actions>
      </Card>

      {preview ? (
        <Card>
          <CardHead>
            <div>
              <CardTitle>
                Import preview
                <Badge
                  $tone={toneFor(BATCH_STATUS, preview.batch.status).tone}
                  style={{ marginLeft: 8 }}
                >
                  {toneFor(BATCH_STATUS, preview.batch.status).label}
                </Badge>
              </CardTitle>
              <CardText>
                Batch {preview.batch.id.slice(0, 8)} ·{' '}
                {preview.format ? `${preview.format.toUpperCase()} · ` : ''}
                {formatDateTime(preview.batch.createdAt, timezone)} ·{' '}
                {Object.keys(preview.batch.mapping || {}).length} of{' '}
                {IMPORT_FIELDS.length} columns mapped.
              </CardText>
            </div>
            <Actions>
              {!batchLocked ? (
                <>
                  <Button
                    type="button"
                    $variant="primary"
                    onClick={commit}
                    disabled={!canCommit}
                  >
                    {busy === 'commit' ? (
                      <Loader2 size={15} className="spin" />
                    ) : (
                      <Upload size={15} />
                    )}
                    {busy === 'commit'
                      ? 'Importing…'
                      : `Import ${formatCount(totals?.valid)} valid ${
                          totals?.valid === 1 ? 'lead' : 'leads'
                        }`}
                  </Button>
                  <Button
                    type="button"
                    $variant="danger"
                    onClick={cancelBatch}
                    disabled={Boolean(busy)}
                  >
                    {busy === 'cancel' ? (
                      <Loader2 size={15} className="spin" />
                    ) : (
                      <X size={15} />
                    )}
                    Cancel import
                  </Button>
                </>
              ) : (
                <LinkButton href="/workspace/leads">
                  <BadgeCheck size={15} />
                  View leads
                </LinkButton>
              )}
            </Actions>
          </CardHead>

          <StatGrid>
            <StatCard>
              <StatLabel>Rows</StatLabel>
              <StatValue>{formatCount(totals?.rows)}</StatValue>
            </StatCard>
            <StatCard>
              <StatLabel>Ready to import</StatLabel>
              <StatValue>{formatCount(totals?.valid)}</StatValue>
            </StatCard>
            <StatCard>
              <StatLabel>Need fixes</StatLabel>
              <StatValue>{formatCount(totals?.invalid)}</StatValue>
            </StatCard>
            <StatCard>
              <StatLabel>Possible duplicates</StatLabel>
              <StatValue>{formatCount(totals?.duplicates)}</StatValue>
            </StatCard>
          </StatGrid>

          {repeated ? (
            <Notice $tone="warning">
              <CircleAlert size={15} />
              <div>
                <strong>This exact content was already imported.</strong>
                <p style={{ marginTop: 4 }}>
                  Nothing will be imported from this preview. Review the
                  previous batch, or change the rows if these are genuinely new
                  entries.
                </p>
                {preview.previousBatchId ? (
                  <div style={{ marginTop: 8 }}>
                    <Button
                      type="button"
                      $variant="ghost"
                      onClick={() => openBatch(preview.previousBatchId)}
                      disabled={Boolean(busy)}
                    >
                      Review the committed batch
                    </Button>
                  </div>
                ) : null}
              </div>
            </Notice>
          ) : null}

          {preview.rows.length === 0 ? (
            <EmptyState>
              <FileText size={17} aria-hidden="true" />
              <div>
                <h3>No rows were parsed</h3>
                <p>Paste at least one data row, or check the column layout.</p>
              </div>
            </EmptyState>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Company</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th>Details</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => {
                    const status = toneFor(ROW_STATUS, row.status);
                    const errors = Object.entries(row.errors || {});
                    const warnings = row.warnings || [];
                    return (
                      <tr key={row.id}>
                        <td>{row.rowNumber}</td>
                        <td>
                          {row.normalized?.companyName ||
                            row.raw?.companyName ||
                            '—'}
                        </td>
                        <td>
                          {[row.normalized?.contactName || row.raw?.contactName, row.normalized?.phone || row.raw?.phone]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </td>
                        <td>
                          <Badge $tone={status.tone}>{status.label}</Badge>
                        </td>
                        <td>
                          {errors.length === 0 ? null : (
                            <ul style={{ margin: 0, paddingLeft: 16 }}>
                              {errors.map(([field, message]) => (
                                <li key={field} style={{ color: '#B42318' }}>
                                  {IMPORT_FIELD_LABELS[field] || field}:{' '}
                                  {message}
                                </li>
                              ))}
                            </ul>
                          )}
                          {warnings.length === 0 ? null : (
                            <ul style={{ margin: 0, paddingLeft: 16 }}>
                              {warnings.map((message) => (
                                <li key={message}>{message}</li>
                              ))}
                            </ul>
                          )}
                          {row.duplicateLeadId ? (
                            <div style={{ marginTop: 4 }}>
                              <Link href={`/workspace/leads/${row.duplicateLeadId}`}>
                                Open existing lead
                              </Link>
                            </div>
                          ) : null}
                          {row.importedLeadId ? (
                            <div style={{ marginTop: 4 }}>
                              <Link href={`/workspace/leads/${row.importedLeadId}`}>
                                Open imported lead
                              </Link>
                            </div>
                          ) : null}
                          {errors.length === 0 && warnings.length === 0 && !row.duplicateLeadId ? (
                            <span>—</span>
                          ) : null}
                        </td>
                        <td>
                          {!batchLocked ? (
                            <Button
                              type="button"
                              $variant="ghost"
                              onClick={() => startEdit(row)}
                              disabled={Boolean(busy)}
                            >
                              Fix row
                            </Button>
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          )}

          {editing && !batchLocked ? (
            <Card>
              <CardHead>
                <div>
                  <CardTitle>Correct row</CardTitle>
                  <CardText>
                    Change the original values, then save to re-run validation
                    and duplicate checks for every row.
                  </CardText>
                </div>
              </CardHead>

              {rowError ? (
                <Notice $tone="danger">
                  <CircleAlert size={15} />
                  <span>{rowError}</span>
                </Notice>
              ) : null}

              <Grid $cols={3}>
                {IMPORT_FIELDS.map((field) => (
                  <Field key={field}>
                    <Label htmlFor={`fix-${field}`}>
                      {IMPORT_FIELD_LABELS[field]}
                    </Label>
                    {LONG_FIELDS.has(field) ? (
                      <Textarea
                        id={`fix-${field}`}
                        value={editing.values[field] ?? ''}
                        onChange={(event) =>
                          setEditValue(field, event.target.value)
                        }
                        disabled={Boolean(busy)}
                        style={{ minHeight: 74 }}
                      />
                    ) : (
                      <Input
                        id={`fix-${field}`}
                        value={editing.values[field] ?? ''}
                        onChange={(event) =>
                          setEditValue(field, event.target.value)
                        }
                        disabled={Boolean(busy)}
                      />
                    )}
                  </Field>
                ))}
              </Grid>

              {rowError ? null : (
                <Hint>
                  Blank values are allowed. Dates accept DD/MM/YYYY,
                  YYYY-MM-DD or 12 Jan 2026, and money accepts ₹, commas or
                  plain numbers.
                </Hint>
              )}

              <Actions>
                <Button
                  type="button"
                  $variant="primary"
                  onClick={saveCorrection}
                  disabled={Boolean(busy)}
                >
                  {busy === `save:${editing.rowId}` ? (
                    <Loader2 size={15} className="spin" />
                  ) : (
                    <Save size={15} />
                  )}
                  Save and re-check
                </Button>
                <Button
                  type="button"
                  $variant="ghost"
                  onClick={() => {
                    setEditing(null);
                    setRowError(null);
                  }}
                  disabled={Boolean(busy)}
                >
                  <X size={15} />
                  Close
                </Button>
              </Actions>
            </Card>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHead>
          <div>
            <CardTitle>Import history</CardTitle>
            <CardText>
              Every batch keeps its source, importer, timestamps and original
              rows. Committed batches create native leads; cancelled batches
              create nothing.
            </CardText>
          </div>
        </CardHead>

        {batches.length === 0 ? (
          <EmptyState>
            <Upload size={17} aria-hidden="true" />
            <div>
              <h3>No imports yet</h3>
              <p>Paste rows above to create the first preview.</p>
            </div>
          </EmptyState>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Source</th>
                  <th>File</th>
                  <th>Rows</th>
                  <th>Valid</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => {
                  const status = toneFor(BATCH_STATUS, batch.status);
                  const isOpen = preview?.batch.id === batch.id;
                  return (
                    <tr key={batch.id}>
                      <td>{formatDateTime(batch.createdAt, timezone)}</td>
                      <td>{batch.source}</td>
                      <td>{batch.fileName || '—'}</td>
                      <td>{formatCount(batch.totals?.rows)}</td>
                      <td>{formatCount(batch.totals?.valid)}</td>
                      <td>
                        <Badge $tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>
                        <Button
                          type="button"
                          $variant="ghost"
                          onClick={() => openBatch(batch.id)}
                          disabled={isOpen || Boolean(busy)}
                        >
                          {busy === `open:${batch.id}` ? (
                            <Loader2 size={15} className="spin" />
                          ) : null}
                          {isOpen ? 'Open' : 'Review'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Hint>
        Imported money values are recorded as owner-reported and unverified.
        They never create payments or invoices automatically.
      </Hint>
    </Page>
  );
}
