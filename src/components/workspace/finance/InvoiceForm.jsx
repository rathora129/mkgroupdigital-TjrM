'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import {
  Actions,
  Button,
  ErrorText,
  Field,
  Grid,
  Hint,
  Input,
  Label,
  Notice,
  Select,
  Stack,
  Textarea,
} from '@/components/workspace/ai/primitives';
import {
  bpsFromPercent,
  percentInput,
  toMajorInput,
  toMinorInput,
} from '@/components/workspace/proposals/meta';
import { computeInvoiceLines } from '@/lib/billing/calc';
import {
  INVOICE_SOURCE_LABELS,
  dateInputValue,
} from './meta';

const schema = yup.object({
  invoiceDate: yup.string().required('Choose the invoice date.'),
  dueDate: yup.string(),
});

const emptyLine = () => ({
  description: '',
  quantity: '1',
  unitPrice: '',
  discountType: 'none',
  discountValue: '',
  taxScheme: 'none',
  taxRate: '',
});

function lineFromRecord(line) {
  return {
    description: line.description || '',
    quantity: String(line.quantity ?? 1),
    unitPrice: toMajorInput(line.unitPriceCents),
    discountType: line.discountType || 'none',
    discountValue:
      line.discountType === 'percent'
        ? percentInput(line.discountValue)
        : toMajorInput(line.discountValue),
    taxScheme: line.taxScheme || 'none',
    taxRate: percentInput(line.taxRateBps),
  };
}

function toApiLines(lines) {
  return lines.map((line) => ({
    description: line.description,
    quantity: Number(line.quantity) || 1,
    unitPriceCents: toMinorInput(line.unitPrice || 0),
    discountType: line.discountType,
    discountValue:
      line.discountType === 'percent'
        ? bpsFromPercent(line.discountValue || 0)
        : toMinorInput(line.discountValue || 0),
    taxScheme: line.taxScheme,
    taxRateBps: bpsFromPercent(line.taxRate || 0),
  }));
}

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function InvoiceForm({
  invoice = null,
  options = { clients: [], projects: [], engagements: [], proposals: [] },
  onDone,
  onCancel,
}) {
  const [failure, setFailure] = useState(null);
  const editing = Boolean(invoice);
  const today = new Date().toISOString().slice(0, 10);

  const formik = useFormik({
    initialValues: {
      source: invoice?.source || (options.proposals.length > 0 ? 'proposal' : 'manual'),
      proposalId: '',
      engagementId: '',
      clientId: invoice?.clientId || '',
      projectId: invoice?.projectId || '',
      periodLabel: '',
      invoiceDate: dateInputValue(invoice?.invoiceDate) || today,
      dueDate: dateInputValue(invoice?.dueDate),
      currency: invoice?.currency || 'INR',
      notes: invoice?.notes || '',
      terms: invoice?.terms || '',
      lines:
        invoice?.lines?.length > 0
          ? invoice.lines.map(lineFromRecord)
          : [emptyLine()],
    },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      const payload = {
        invoiceDate: toIsoDate(values.invoiceDate),
        dueDate: toIsoDate(values.dueDate),
        notes: values.notes.trim() || null,
        terms: values.terms.trim() || null,
      };

      try {
        let result;
        if (editing) {
          result = await apiRequest(`/api/workforce/invoices/${invoice.id}`, {
            method: 'PATCH',
            body: {
              ...payload,
              currency: values.currency.trim().toUpperCase(),
              expectedUpdatedAt: invoice.updatedAt,
              lines: toApiLines(values.lines),
            },
          });
        } else {
          const body = {
            ...payload,
            source: values.source,
            currency: values.currency.trim().toUpperCase(),
            projectId: values.projectId || null,
          };
          if (values.source === 'proposal') {
            body.proposalId = values.proposalId;
          } else if (values.source === 'engagement') {
            body.engagementId = values.engagementId;
            body.periodLabel = values.periodLabel.trim() || null;
          } else {
            body.clientId = values.clientId;
            body.lines = toApiLines(values.lines);
          }
          result = await apiRequest('/api/workforce/invoices', {
            method: 'POST',
            body,
          });
        }
        onDone?.(result);
      } catch (error) {
        if (error.code === 'VALIDATION_FAILED' && error.details) {
          helpers.setErrors(error.details);
        }
        setFailure(error.message);
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const selectedProposal = options.proposals.find(
    (entry) => entry.proposalId === formik.values.proposalId,
  );
  const selectedEngagement = options.engagements.find(
    (entry) => entry.id === formik.values.engagementId,
  );
  const effectiveClientId =
    formik.values.source === 'proposal'
      ? selectedProposal?.clientId
      : formik.values.source === 'engagement'
        ? selectedEngagement?.clientId
        : formik.values.clientId;
  const projectOptions = options.projects.filter(
    (project) => !effectiveClientId || !project.clientId || project.clientId === effectiveClientId,
  );

  const preview =
    formik.values.source === 'manual' || editing
      ? computeInvoiceLines(toApiLines(formik.values.lines))
      : { totals: { totalCents: 0 } };

  function updateLine(index, patch) {
    const next = formik.values.lines.map((line, position) =>
      position === index ? { ...line, ...patch } : line,
    );
    formik.setFieldValue('lines', next);
  }

  function removeLine(index) {
    const next = formik.values.lines.filter((_, position) => position !== index);
    formik.setFieldValue('lines', next.length > 0 ? next : [emptyLine()]);
  }

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={14}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}

        {!editing ? (
          <Field>
            <Label htmlFor="invoice-source">Invoice source</Label>
            <Select
              id="invoice-source"
              name="source"
              value={formik.values.source}
              onChange={(event) => {
                formik.handleChange(event);
                formik.setFieldValue('proposalId', '');
                formik.setFieldValue('engagementId', '');
                formik.setFieldValue('clientId', '');
                formik.setFieldValue('projectId', '');
              }}
              disabled={formik.isSubmitting}
            >
              {Object.entries(INVOICE_SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Hint>
              Invoices snapshot an accepted proposal, an active service
              engagement, or an authorized manual entry. Accepting a proposal
              never generates an invoice automatically.
            </Hint>
          </Field>
        ) : null}

        {!editing && formik.values.source === 'proposal' ? (
          <Field>
            <Label htmlFor="invoice-proposal">Accepted proposal</Label>
            <Select
              id="invoice-proposal"
              name="proposalId"
              value={formik.values.proposalId}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="">Choose an accepted proposal</option>
              {options.proposals.map((proposal) => (
                <option key={proposal.proposalId} value={proposal.proposalId}>
                  {proposal.reference} · {proposal.title} · {proposal.clientName}
                </option>
              ))}
            </Select>
            {options.proposals.length === 0 ? (
              <Hint>No accepted proposal is waiting to be invoiced.</Hint>
            ) : null}
            {selectedProposal ? (
              <Hint>
                {selectedProposal.currency} · one-time value{' '}
                {toMajorInput(selectedProposal.oneTimeTotalCents)}. Line items are
                copied from the accepted version.
              </Hint>
            ) : null}
          </Field>
        ) : null}

        {!editing && formik.values.source === 'engagement' ? (
          <Grid $cols={2}>
            <Field>
              <Label htmlFor="invoice-engagement">Active engagement</Label>
              <Select
                id="invoice-engagement"
                name="engagementId"
                value={formik.values.engagementId}
                onChange={formik.handleChange}
                disabled={formik.isSubmitting}
              >
                <option value="">Choose an engagement</option>
                {options.engagements.map((engagement) => (
                  <option key={engagement.id} value={engagement.id}>
                    {engagement.name} · {engagement.clientName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label htmlFor="invoice-period">Billing period label</Label>
              <Input
                id="invoice-period"
                name="periodLabel"
                value={formik.values.periodLabel}
                onChange={formik.handleChange}
                placeholder="e.g. November 2026"
                maxLength={80}
                disabled={formik.isSubmitting}
              />
            </Field>
          </Grid>
        ) : null}

        {!editing && formik.values.source === 'manual' ? (
          <Grid $cols={3}>
            <Field>
              <Label htmlFor="invoice-client">Client</Label>
              <Select
                id="invoice-client"
                name="clientId"
                value={formik.values.clientId}
                onChange={formik.handleChange}
                disabled={formik.isSubmitting}
              >
                <option value="">Choose a client</option>
                {options.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.reference} · {client.companyName}
                  </option>
                ))}
              </Select>
              {formik.errors.clientId ? (
                <ErrorText>{formik.errors.clientId}</ErrorText>
              ) : null}
            </Field>
            <Field>
              <Label htmlFor="invoice-currency">Currency</Label>
              <Input
                id="invoice-currency"
                name="currency"
                value={formik.values.currency}
                onChange={formik.handleChange}
                maxLength={3}
                disabled={formik.isSubmitting}
              />
            </Field>
          </Grid>
        ) : null}

        <Grid $cols={3}>
          <Field>
            <Label htmlFor="invoice-project">Project (optional)</Label>
            <Select
              id="invoice-project"
              name="projectId"
              value={formik.values.projectId}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="">No project link</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.reference} · {project.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="invoice-date">Invoice date</Label>
            <Input
              id="invoice-date"
              name="invoiceDate"
              type="date"
              value={formik.values.invoiceDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.invoiceDate ? (
              <ErrorText>{formik.errors.invoiceDate}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="invoice-due">Due date</Label>
            <Input
              id="invoice-due"
              name="dueDate"
              type="date"
              value={formik.values.dueDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
        </Grid>

        {editing || formik.values.source === 'manual' ? (
          <Stack $gap={10}>
            <Label>Line items</Label>
            {formik.errors.lines && typeof formik.errors.lines === 'string' ? (
              <ErrorText>{formik.errors.lines}</ErrorText>
            ) : null}
            {formik.values.lines.map((line, index) => (
              <div
                key={`line-${index}`}
                style={{
                  display: 'grid',
                  gap: 8,
                  padding: 10,
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                }}
              >
                <Field>
                  <Label>Description</Label>
                  <Input
                    value={line.description}
                    onChange={(event) =>
                      updateLine(index, { description: event.target.value })
                    }
                    maxLength={300}
                    disabled={formik.isSubmitting}
                  />
                </Field>
                <Grid $cols={3}>
                  <Field>
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(event) => updateLine(index, { quantity: event.target.value })}
                      disabled={formik.isSubmitting}
                    />
                  </Field>
                  <Field>
                    <Label>Unit price</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                      disabled={formik.isSubmitting}
                    />
                  </Field>
                  <Field>
                    <Label>Tax treatment</Label>
                    <Select
                      value={line.taxScheme}
                      onChange={(event) =>
                        updateLine(index, {
                          taxScheme: event.target.value,
                          taxRate: event.target.value === 'none' ? '' : line.taxRate,
                        })
                      }
                      disabled={formik.isSubmitting}
                    >
                      <option value="none">No tax</option>
                      <option value="cgst_sgst">CGST + SGST</option>
                      <option value="igst">IGST</option>
                    </Select>
                  </Field>
                  <Field>
                    <Label>Discount type</Label>
                    <Select
                      value={line.discountType}
                      onChange={(event) =>
                        updateLine(index, {
                          discountType: event.target.value,
                          discountValue: '',
                        })
                      }
                      disabled={formik.isSubmitting}
                    >
                      <option value="none">No discount</option>
                      <option value="fixed">Fixed amount</option>
                      <option value="percent">Percentage</option>
                    </Select>
                  </Field>
                  <Field>
                    <Label>
                      Discount {line.discountType === 'percent' ? '(%)' : ''}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.discountValue}
                      onChange={(event) =>
                        updateLine(index, { discountValue: event.target.value })
                      }
                      disabled={formik.isSubmitting || line.discountType === 'none'}
                    />
                  </Field>
                  <Field>
                    <Label>Tax rate (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={line.taxRate}
                      onChange={(event) => updateLine(index, { taxRate: event.target.value })}
                      disabled={formik.isSubmitting || line.taxScheme === 'none'}
                    />
                  </Field>
                </Grid>
                {formik.values.lines.length > 1 ? (
                  <Actions>
                    <Button
                      type="button"
                      $variant="ghost"
                      onClick={() => removeLine(index)}
                      disabled={formik.isSubmitting}
                    >
                      <Trash2 size={13} />
                      Remove line
                    </Button>
                  </Actions>
                ) : null}
              </div>
            ))}
            <Actions>
              <Button
                type="button"
                $variant="ghost"
                onClick={() => formik.setFieldValue('lines', [...formik.values.lines, emptyLine()])}
                disabled={formik.isSubmitting}
              >
                <Plus size={14} />
                Add line
              </Button>
            </Actions>
            <Hint>
              Line totals are calculated with integer minor units. The saved
              document keeps its own copy of every line.
            </Hint>
            {(editing || formik.values.source === 'manual') && preview.totals.totalCents > 0 ? (
              <Hint>
                Estimated total: {toMajorInput(preview.totals.totalCents)} {formik.values.currency}
              </Hint>
            ) : null}
          </Stack>
        ) : (
          <Notice $tone="info">
            Line items will be copied from the selected record when the draft is
            created. You can still review them before approval.
          </Notice>
        )}

        <Field>
          <Label htmlFor="invoice-notes">Notes</Label>
          <Textarea
            id="invoice-notes"
            name="notes"
            value={formik.values.notes}
            onChange={formik.handleChange}
            maxLength={4_000}
            style={{ minHeight: 70 }}
            disabled={formik.isSubmitting}
          />
        </Field>
        <Field>
          <Label htmlFor="invoice-terms">Payment terms</Label>
          <Textarea
            id="invoice-terms"
            name="terms"
            value={formik.values.terms}
            onChange={formik.handleChange}
            maxLength={4_000}
            style={{ minHeight: 70 }}
            disabled={formik.isSubmitting}
          />
        </Field>

        <Actions>
          <Button type="submit" $variant="primary" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {formik.isSubmitting ? 'Saving…' : editing ? 'Save draft' : 'Create draft invoice'}
          </Button>
          {onCancel ? (
            <Button
              type="button"
              $variant="ghost"
              onClick={onCancel}
              disabled={formik.isSubmitting}
            >
              <X size={14} />
              Cancel
            </Button>
          ) : null}
        </Actions>
      </Stack>
    </form>
  );
}
