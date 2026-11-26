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
import { dateInputValue, TICKET_CATEGORY_LABELS } from './meta';

const optionalText = (max, message) => yup.string().trim().max(max, message);

const buildSchema = (editing) =>
  yup.object({
    clientId: editing
      ? yup.string()
      : yup.string().required('Choose a client.'),
    projectId: yup.string(),
    subject: yup
      .string()
      .trim()
      .min(2, 'Subject must be at least 2 characters.')
      .max(200, 'Subject must be 200 characters or fewer.')
      .required('Subject is required.'),
    description: optionalText(8_000, 'Description is too long.'),
    category: yup
      .string()
      .oneOf(Object.keys(TICKET_CATEGORY_LABELS))
      .required(),
    priority: yup.string().oneOf(['low', 'medium', 'high', 'urgent']).required(),
    assignedUserId: yup.string(),
    dueDate: yup.string(),
  });

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function TicketForm({
  ticket = null,
  clients = [],
  projects = [],
  members = [],
  fixedClientId = '',
  initialClientId = '',
  onDone,
  onCancel,
}) {
  const [failure, setFailure] = useState(null);
  const editing = Boolean(ticket);
  const lockedClientId = ticket?.clientId || fixedClientId || '';

  const formik = useFormik({
    initialValues: {
      clientId: lockedClientId || initialClientId || '',
      projectId: ticket?.projectId || '',
      subject: ticket?.subject || '',
      description: ticket?.description || '',
      category: ticket?.category || 'general',
      priority: ticket?.priority || 'medium',
      assignedUserId: ticket?.assignedUserId || '',
      dueDate: dateInputValue(ticket?.dueDate),
    },
    validationSchema: buildSchema(editing),
    validateOnMount: false,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      const payload = {
        projectId: values.projectId || null,
        subject: values.subject.trim(),
        description: values.description.trim() || null,
        category: values.category,
        priority: values.priority,
        assignedUserId: values.assignedUserId || null,
        dueDate: toIsoDate(values.dueDate),
      };
      try {
        const result = editing
          ? await apiRequest(`/api/workforce/tickets/${ticket.id}`, {
              method: 'PATCH',
              body: { ...payload, expectedUpdatedAt: ticket.updatedAt },
            })
          : await apiRequest('/api/workforce/tickets', {
              method: 'POST',
              body: { ...payload, clientId: values.clientId },
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

  const clientProjects = projects.filter(
    (project) => !formik.values.clientId || project.clientId === formik.values.clientId,
  );

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={14}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}

        <Grid $cols={2}>
          {!editing ? (
            <Field>
              <Label htmlFor="ticket-client">Client</Label>
              <Select
                id="ticket-client"
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
          ) : null}

          <Field>
            <Label htmlFor="ticket-project">Related project (optional)</Label>
            <Select
              id="ticket-project"
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

          <Field>
            <Label htmlFor="ticket-subject">Subject</Label>
            <Input
              id="ticket-subject"
              name="subject"
              value={formik.values.subject}
              onChange={formik.handleChange}
              placeholder="Checkout error on the storefront"
              disabled={formik.isSubmitting}
              required
            />
            {formik.errors.subject ? (
              <ErrorText>{formik.errors.subject}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="ticket-category">Category</Label>
            <Select
              id="ticket-category"
              name="category"
              value={formik.values.category}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              {Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="ticket-priority">Priority</Label>
            <Select
              id="ticket-priority"
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
            <Label htmlFor="ticket-assignee">Assignee</Label>
            <Select
              id="ticket-assignee"
              name="assignedUserId"
              value={formik.values.assignedUserId}
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
            <Hint>Assigning an open ticket moves it to Assigned.</Hint>
          </Field>
          <Field>
            <Label htmlFor="ticket-due">Due date</Label>
            <Input
              id="ticket-due"
              name="dueDate"
              type="date"
              value={formik.values.dueDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
        </Grid>

        <Field>
          <Label htmlFor="ticket-description">Description</Label>
          <Textarea
            id="ticket-description"
            name="description"
            value={formik.values.description}
            onChange={formik.handleChange}
            maxLength={8_000}
            style={{ minHeight: 90 }}
            disabled={formik.isSubmitting}
          />
          {formik.errors.description ? (
            <ErrorText>{formik.errors.description}</ErrorText>
          ) : null}
        </Field>

        <Actions>
          <Button type="submit" $variant="primary" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}
            {formik.isSubmitting ? 'Saving…' : editing ? 'Save ticket' : 'Create ticket'}
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
