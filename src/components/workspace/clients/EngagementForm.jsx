'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Loader2, Save, X } from 'lucide-react';
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
  formatMoney,
  toMajorInput,
  toMinorInput,
} from '@/components/workspace/proposals/meta';
import { ENGAGEMENT_FREQUENCY_LABELS, dateInputValue } from './meta';

const optionalText = (max, message) => yup.string().trim().max(max, message);

const schema = yup.object({
  clientId: yup.string().required('Choose a client.'),
  name: yup
    .string()
    .trim()
    .min(2, 'Engagement name is required.')
    .max(200, 'Engagement name must be 200 characters or fewer.')
    .required('Engagement name is required.'),
  serviceId: yup.string(),
  proposalId: yup.string(),
  projectId: yup.string(),
  managerUserId: yup.string(),
  status: yup.string().oneOf(['planned', 'active']),
  frequency: yup
    .string()
    .oneOf(['one_time', 'weekly', 'monthly', 'quarterly', 'annual', 'custom'])
    .required(),
  startDate: yup.string(),
  endDate: yup.string(),
  renewalDate: yup.string(),
  scopeReference: optionalText(300, 'Scope reference is too long.'),
  contractValue: yup
    .number()
    .transform((value, original) => (original === '' ? 0 : value))
    .min(0, 'Contract value cannot be negative.'),
  currency: yup
    .string()
    .trim()
    .uppercase()
    .matches(/^[A-Z]{3}$/, 'Use a three-letter currency code.')
    .required('Enter a currency code.'),
  internalNotes: optionalText(4_000, 'Internal notes are too long.'),
});

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function EngagementForm({
  engagement = null,
  clients = [],
  linkOptions = { proposals: [], projects: [], services: [] },
  members = [],
  fixedClientId = '',
  onDone,
  onCancel,
}) {
  const [failure, setFailure] = useState(null);
  const editing = Boolean(engagement);
  const lockedClientId = engagement?.clientId || fixedClientId || '';

  const formik = useFormik({
    initialValues: {
      clientId: lockedClientId,
      name: engagement?.name || '',
      serviceId: engagement?.serviceId || '',
      proposalId: engagement?.proposalId || '',
      projectId: engagement?.projectId || '',
      managerUserId: engagement?.managerUserId || '',
      status: editing ? engagement?.status : 'planned',
      frequency: engagement?.frequency || 'monthly',
      startDate: dateInputValue(engagement?.startDate),
      endDate: dateInputValue(engagement?.endDate),
      renewalDate: dateInputValue(engagement?.renewalDate),
      scopeReference: engagement?.scopeReference || '',
      contractValue: engagement ? toMajorInput(engagement.contractValueCents) : '',
      currency: engagement?.currency || 'INR',
      internalNotes: engagement?.internalNotes || '',
    },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      const payload = {
        clientId: values.clientId,
        name: values.name.trim(),
        serviceId: values.serviceId || null,
        proposalId: values.proposalId || null,
        projectId: values.projectId || null,
        managerUserId: values.managerUserId || null,
        frequency: values.frequency,
        startDate: toIsoDate(values.startDate),
        endDate: toIsoDate(values.endDate),
        renewalDate: toIsoDate(values.renewalDate),
        scopeReference: values.scopeReference.trim() || null,
        contractValueCents: toMinorInput(values.contractValue || 0),
        currency: values.currency.trim().toUpperCase(),
        internalNotes: values.internalNotes.trim() || null,
      };
      if (!editing) payload.status = values.status;
      try {
        const result = editing
          ? await apiRequest(`/api/workforce/engagements/${engagement.id}`, {
              method: 'PATCH',
              body: { ...payload, expectedUpdatedAt: engagement.updatedAt },
            })
          : await apiRequest('/api/workforce/engagements', {
              method: 'POST',
              body: payload,
            });
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

  const clientProjects = linkOptions.projects.filter(
    (project) => !formik.values.clientId || project.clientId === formik.values.clientId,
  );
  const currency = formik.values.currency || 'INR';

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={14}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="engagement-client">Client</Label>
            <Select
              id="engagement-client"
              name="clientId"
              value={formik.values.clientId}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting || Boolean(lockedClientId)}
            >
              <option value="">Choose a client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </Select>
            {formik.errors.clientId ? (
              <ErrorText>{formik.errors.clientId}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="engagement-name">Engagement name</Label>
            <Input
              id="engagement-name"
              name="name"
              value={formik.values.name}
              onChange={formik.handleChange}
              placeholder="Monthly growth retainer"
              disabled={formik.isSubmitting}
              required
            />
            {formik.errors.name ? <ErrorText>{formik.errors.name}</ErrorText> : null}
          </Field>

          <Field>
            <Label htmlFor="engagement-service">Catalogue service</Label>
            <Select
              id="engagement-service"
              name="serviceId"
              value={formik.values.serviceId}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="">No catalogue link</option>
              {linkOptions.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="engagement-manager">Service manager</Label>
            <Select
              id="engagement-manager"
              name="managerUserId"
              value={formik.values.managerUserId}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name || member.email}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label htmlFor="engagement-proposal">Related proposal (optional)</Label>
            <Select
              id="engagement-proposal"
              name="proposalId"
              value={formik.values.proposalId}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="">No proposal link</option>
              {linkOptions.proposals.map((proposal) => (
                <option key={proposal.id} value={proposal.id}>
                  {proposal.reference} · {proposal.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="engagement-project">Related project (optional)</Label>
            <Select
              id="engagement-project"
              name="projectId"
              value={formik.values.projectId}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="">No project link</option>
              {clientProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.reference} · {project.name}
                </option>
              ))}
            </Select>
          </Field>

          {!editing ? (
            <Field>
              <Label htmlFor="engagement-status">Starting status</Label>
              <Select
                id="engagement-status"
                name="status"
                value={formik.values.status}
                onChange={formik.handleChange}
                disabled={formik.isSubmitting}
              >
                <option value="planned">Planned</option>
                <option value="active">Active</option>
              </Select>
              <Hint>Later status changes use the controlled service lifecycle.</Hint>
            </Field>
          ) : null}
          <Field>
            <Label htmlFor="engagement-frequency">Frequency</Label>
            <Select
              id="engagement-frequency"
              name="frequency"
              value={formik.values.frequency}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              {Object.entries(ENGAGEMENT_FREQUENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label htmlFor="engagement-start">Start date</Label>
            <Input
              id="engagement-start"
              name="startDate"
              type="date"
              value={formik.values.startDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
          <Field>
            <Label htmlFor="engagement-end">End date</Label>
            <Input
              id="engagement-end"
              name="endDate"
              type="date"
              value={formik.values.endDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
          <Field>
            <Label htmlFor="engagement-renewal">Renewal date</Label>
            <Input
              id="engagement-renewal"
              name="renewalDate"
              type="date"
              value={formik.values.renewalDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
          <Field>
            <Label htmlFor="engagement-value">Contract value</Label>
            <Input
              id="engagement-value"
              name="contractValue"
              inputMode="decimal"
              value={formik.values.contractValue}
              onChange={formik.handleChange}
              placeholder="0.00"
              disabled={formik.isSubmitting}
            />
            <Hint>
              {formatMoney(toMinorInput(formik.values.contractValue || 0), currency)} per
              frequency period. Internal reference only.
            </Hint>
            {formik.errors.contractValue ? (
              <ErrorText>{formik.errors.contractValue}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="engagement-currency">Currency</Label>
            <Input
              id="engagement-currency"
              name="currency"
              value={formik.values.currency}
              onChange={formik.handleChange}
              maxLength={3}
              disabled={formik.isSubmitting}
            />
            {formik.errors.currency ? (
              <ErrorText>{formik.errors.currency}</ErrorText>
            ) : null}
          </Field>
        </Grid>

        <Field>
          <Label htmlFor="engagement-scope">Scope reference</Label>
          <Input
            id="engagement-scope"
            name="scopeReference"
            value={formik.values.scopeReference}
            onChange={formik.handleChange}
            placeholder="Proposal section, SOW reference or milestone"
            disabled={formik.isSubmitting}
          />
        </Field>

        <Field>
          <Label htmlFor="engagement-notes">Internal notes</Label>
          <Textarea
            id="engagement-notes"
            name="internalNotes"
            value={formik.values.internalNotes}
            onChange={formik.handleChange}
            maxLength={4_000}
            style={{ minHeight: 70 }}
            disabled={formik.isSubmitting}
          />
        </Field>

        <Actions>
          <Button type="submit" $variant="primary" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}
            {formik.isSubmitting
              ? 'Saving…'
              : editing
                ? 'Save engagement'
                : 'Create engagement'}
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
