'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Loader2, Save, X } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import {
  Actions,
  Button,
  CheckGrid,
  CheckLabel,
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
import { formatDate } from '@/lib/ai/format';
import { formatMoney } from '@/components/workspace/proposals/meta';
import { toIsoDate } from './meta';

const optionalText = (max, message) =>
  yup.string().trim().max(max, message);

const schema = yup.object({
  proposalId: yup.string().required('Choose an accepted proposal.'),
  name: optionalText(200, 'Project name must be 200 characters or fewer.'),
  ownerUserId: yup.string(),
  priority: yup
    .string()
    .oneOf(['low', 'medium', 'high', 'urgent'])
    .required(),
  startDate: yup.string(),
  expectedCompletionDate: yup.string(),
  description: optionalText(4_000, 'Description must be 4,000 characters or fewer.'),
  internalNotes: optionalText(4_000, 'Internal notes must be 4,000 characters or fewer.'),
});

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export default function ProjectCreateForm({ options = [], members = [], onDone, onCancel }) {
  const [failure, setFailure] = useState(null);
  const [selectedMembers, setSelectedMembers] = useState([]);

  const formik = useFormik({
    initialValues: {
      proposalId: options.length === 1 ? options[0].proposalId : '',
      name: '',
      ownerUserId: '',
      priority: 'medium',
      startDate: '',
      expectedCompletionDate: '',
      description: '',
      internalNotes: '',
    },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        const result = await apiRequest('/api/workforce/projects', {
          method: 'POST',
          body: {
            proposalId: values.proposalId,
            name: textOrNull(values.name),
            ownerUserId: values.ownerUserId || null,
            priority: values.priority,
            startDate: toIsoDate(values.startDate),
            expectedCompletionDate: toIsoDate(values.expectedCompletionDate),
            description: textOrNull(values.description),
            internalNotes: textOrNull(values.internalNotes),
            memberUserIds: selectedMembers,
          },
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

  const selected = options.find((option) => option.proposalId === formik.values.proposalId);

  function toggleMember(userId) {
    setSelectedMembers((current) =>
      current.includes(userId)
        ? current.filter((entry) => entry !== userId)
        : [...current, userId],
    );
  }

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={14}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}

        {options.length === 0 ? (
          <Notice $tone="warning">
            No accepted proposals are waiting for a project. Accept a proposal
            first; every project must trace back to an accepted commercial
            document.
          </Notice>
        ) : null}

        <Field>
          <Label htmlFor="project-proposal">Accepted proposal</Label>
          <Select
            id="project-proposal"
            name="proposalId"
            value={formik.values.proposalId}
            onChange={formik.handleChange}
            disabled={formik.isSubmitting || options.length === 0}
          >
            <option value="">Choose an accepted proposal</option>
            {options.map((option) => (
              <option key={option.proposalId} value={option.proposalId}>
                {option.reference} · {option.title} · {option.companyName}
              </option>
            ))}
          </Select>
          {formik.errors.proposalId ? (
            <ErrorText>{formik.errors.proposalId}</ErrorText>
          ) : null}
        </Field>

        {selected ? (
          <Notice $tone="info">
            Version {selected.versionNumber} accepted for {selected.companyName}.
            One-time value {formatMoney(selected.acceptedValueCents, selected.currency)}.
            {selected.recurringMonthlyCents
              ? ` Recurring ${formatMoney(selected.recurringMonthlyCents, selected.currency)} per month.`
              : ''}{' '}
            Accepted {formatDate(selected.respondedAt)}.
          </Notice>
        ) : null}

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              name="name"
              value={formik.values.name}
              onChange={formik.handleChange}
              placeholder="Leave blank to use the proposal title"
              disabled={formik.isSubmitting}
            />
            {formik.errors.name ? <ErrorText>{formik.errors.name}</ErrorText> : null}
          </Field>
          <Field>
            <Label htmlFor="project-owner">Delivery owner</Label>
            <Select
              id="project-owner"
              name="ownerUserId"
              value={formik.values.ownerUserId}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="">Me (default)</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name || member.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="project-priority">Priority</Label>
            <Select
              id="project-priority"
              name="priority"
              value={formik.values.priority}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>
          <Field>
            <Label htmlFor="project-start">Start date</Label>
            <Input
              id="project-start"
              name="startDate"
              type="date"
              value={formik.values.startDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
          <Field>
            <Label htmlFor="project-completion">Expected completion</Label>
            <Input
              id="project-completion"
              name="expectedCompletionDate"
              type="date"
              value={formik.values.expectedCompletionDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
        </Grid>

        <Field>
          <Label htmlFor="project-description">Delivery description</Label>
          <Textarea
            id="project-description"
            name="description"
            value={formik.values.description}
            onChange={formik.handleChange}
            maxLength={4_000}
            style={{ minHeight: 80 }}
            disabled={formik.isSubmitting}
          />
          {formik.errors.description ? (
            <ErrorText>{formik.errors.description}</ErrorText>
          ) : null}
        </Field>

        <Field>
          <Label htmlFor="project-notes">Internal notes</Label>
          <Textarea
            id="project-notes"
            name="internalNotes"
            value={formik.values.internalNotes}
            onChange={formik.handleChange}
            maxLength={4_000}
            style={{ minHeight: 70 }}
            placeholder="Never shown to the client."
            disabled={formik.isSubmitting}
          />
          {formik.errors.internalNotes ? (
            <ErrorText>{formik.errors.internalNotes}</ErrorText>
          ) : null}
        </Field>

        <Field>
          <Label>Delivery team</Label>
          <CheckGrid>
            {members.map((member) => (
              <CheckLabel key={member.userId}>
                <input
                  type="checkbox"
                  checked={selectedMembers.includes(member.userId)}
                  onChange={() => toggleMember(member.userId)}
                  disabled={formik.isSubmitting}
                />
                {member.name || member.email}
              </CheckLabel>
            ))}
          </CheckGrid>
          <Hint>
            The owner is always added to the team. Milestones and deliverables
            are copied from the accepted proposal version.
          </Hint>
        </Field>

        <Actions>
          <Button
            type="submit"
            $variant="primary"
            disabled={formik.isSubmitting || options.length === 0}
          >
            {formik.isSubmitting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}
            {formik.isSubmitting ? 'Creating…' : 'Create project'}
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
