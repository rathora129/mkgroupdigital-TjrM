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
import { dateInputValue, toIsoDate } from './meta';

const schema = yup.object({
  name: yup
    .string()
    .trim()
    .min(2, 'Project name must be at least 2 characters.')
    .max(200, 'Project name must be 200 characters or fewer.')
    .required('Project name is required.'),
  ownerUserId: yup.string(),
  priority: yup.string().oneOf(['low', 'medium', 'high', 'urgent']).required(),
  startDate: yup.string(),
  expectedCompletionDate: yup.string(),
  description: yup.string().trim().max(4_000, 'Description is too long.'),
  internalNotes: yup.string().trim().max(4_000, 'Internal notes are too long.'),
});

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export default function ProjectSettingsForm({ project, members = [], onDone, onCancel }) {
  const [failure, setFailure] = useState(null);
  const teamMembers = members.filter(
    (member) => member.role !== 'lead' && member.userId !== project.ownerUserId,
  );
  const [selectedMembers, setSelectedMembers] = useState(
    teamMembers.map((member) => member.userId),
  );

  const formik = useFormik({
    initialValues: {
      name: project.name || '',
      ownerUserId: project.ownerUserId || '',
      priority: project.priority || 'medium',
      startDate: dateInputValue(project.startDate),
      expectedCompletionDate: dateInputValue(project.expectedCompletionDate),
      description: project.description || '',
      internalNotes: project.internalNotes || '',
    },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        const result = await apiRequest(`/api/workforce/projects/${project.id}`, {
          method: 'PATCH',
          body: {
            expectedUpdatedAt: new Date(project.updatedAt).toISOString(),
            name: values.name.trim(),
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

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="edit-project-name">Project name</Label>
            <Input
              id="edit-project-name"
              name="name"
              value={formik.values.name}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.name ? <ErrorText>{formik.errors.name}</ErrorText> : null}
          </Field>
          <Field>
            <Label htmlFor="edit-project-owner">Delivery owner</Label>
            <Select
              id="edit-project-owner"
              name="ownerUserId"
              value={formik.values.ownerUserId}
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
            <Label htmlFor="edit-project-priority">Priority</Label>
            <Select
              id="edit-project-priority"
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
            <Label htmlFor="edit-project-start">Start date</Label>
            <Input
              id="edit-project-start"
              name="startDate"
              type="date"
              value={formik.values.startDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
          <Field>
            <Label htmlFor="edit-project-completion">Expected completion</Label>
            <Input
              id="edit-project-completion"
              name="expectedCompletionDate"
              type="date"
              value={formik.values.expectedCompletionDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
        </Grid>

        <Field>
          <Label htmlFor="edit-project-description">Delivery description</Label>
          <Textarea
            id="edit-project-description"
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
          <Label htmlFor="edit-project-notes">Internal notes</Label>
          <Textarea
            id="edit-project-notes"
            name="internalNotes"
            value={formik.values.internalNotes}
            onChange={formik.handleChange}
            maxLength={4_000}
            style={{ minHeight: 70 }}
            disabled={formik.isSubmitting}
          />
          {formik.errors.internalNotes ? (
            <ErrorText>{formik.errors.internalNotes}</ErrorText>
          ) : null}
        </Field>

        <Field>
          <Label>Delivery team</Label>
          <CheckGrid>
            {members
              .filter((member) => member.userId !== formik.values.ownerUserId)
              .map((member) => (
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
          <Hint>The owner is added to the team automatically.</Hint>
        </Field>

        <Actions>
          <Button type="submit" $variant="primary" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}
            {formik.isSubmitting ? 'Saving…' : 'Save details'}
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
