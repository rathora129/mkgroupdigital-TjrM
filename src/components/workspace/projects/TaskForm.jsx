'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Loader2, Save, X } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import {
  TASK_STATUS_TRANSITIONS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from '@/lib/projects/transitions';
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
  title: yup
    .string()
    .trim()
    .min(2, 'Task title must be at least 2 characters.')
    .max(200, 'Task title must be 200 characters or fewer.')
    .required('Task title is required.'),
  description: yup.string().trim().max(4_000, 'Description is too long.'),
  priority: yup.string().oneOf(['low', 'medium', 'high', 'urgent']).required(),
  ownerUserId: yup.string(),
  startDate: yup.string(),
  dueDate: yup.string(),
  estimatedHours: yup.number().min(0, 'Estimated effort cannot be negative.'),
  actualHours: yup.number().min(0, 'Actual effort cannot be negative.'),
});

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function hoursToMinutes(value) {
  const hours = Number(value);
  return Number.isFinite(hours) ? Math.round(hours * 60) : 0;
}

export default function TaskForm({
  projectId,
  task = null,
  tasks = [],
  members = [],
  onDone,
  onCancel,
}) {
  const [failure, setFailure] = useState(null);
  const editing = Boolean(task);
  const allowedStatuses = editing
    ? [task.status, ...(TASK_STATUS_TRANSITIONS[task.status] || [])]
    : ['todo', 'in_progress'];
  const [collaborators, setCollaborators] = useState(
    (task?.collaboratorUserIds || []).filter(Boolean),
  );
  const [dependencies, setDependencies] = useState(task?.dependsOnTaskIds || []);

  const formik = useFormik({
    initialValues: {
      title: task?.title || '',
      description: task?.description || '',
      status: task?.status || 'todo',
      priority: task?.priority || 'medium',
      ownerUserId: task?.ownerUserId || '',
      startDate: dateInputValue(task?.startDate),
      dueDate: dateInputValue(task?.dueDate),
      estimatedHours: task ? task.estimatedMinutes / 60 : '',
      actualHours: task ? task.actualMinutes / 60 : '',
    },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      const payload = {
        title: values.title.trim(),
        description: textOrNull(values.description),
        priority: values.priority,
        ownerUserId: values.ownerUserId || null,
        startDate: toIsoDate(values.startDate),
        dueDate: toIsoDate(values.dueDate),
        estimatedMinutes: hoursToMinutes(values.estimatedHours),
        actualMinutes: hoursToMinutes(values.actualHours),
        collaboratorUserIds: collaborators,
        dependsOnTaskIds: dependencies,
      };

      try {
        const result = editing
          ? await apiRequest(`/api/workforce/tasks/${task.id}`, {
              method: 'PATCH',
              body: {
                ...payload,
                status: values.status,
                expectedUpdatedAt: new Date(task.updatedAt).toISOString(),
              },
            })
          : await apiRequest(`/api/workforce/projects/${projectId}/tasks`, {
              method: 'POST',
              body: { ...payload, status: values.status },
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

  function toggle(list, setList, id) {
    setList((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={14}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="task-title">Task title</Label>
            <Input
              id="task-title"
              name="title"
              value={formik.values.title}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
              required
            />
            {formik.errors.title ? <ErrorText>{formik.errors.title}</ErrorText> : null}
          </Field>
          <Field>
            <Label htmlFor="task-status">Status</Label>
            <Select
              id="task-status"
              name="status"
              value={formik.values.status}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              {allowedStatuses.map((status) => (
                <option key={status} value={status}>
                  {TASK_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
            <Hint>
              Task statuses move forward through the controlled flow; completed
              tasks stay completed.
            </Hint>
          </Field>
          <Field>
            <Label htmlFor="task-priority">Priority</Label>
            <Select
              id="task-priority"
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
            <Label htmlFor="task-owner">Owner</Label>
            <Select
              id="task-owner"
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
            <Label htmlFor="task-start">Start date</Label>
            <Input
              id="task-start"
              name="startDate"
              type="date"
              value={formik.values.startDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
          <Field>
            <Label htmlFor="task-due">Due date</Label>
            <Input
              id="task-due"
              name="dueDate"
              type="date"
              value={formik.values.dueDate}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
          </Field>
          <Field>
            <Label htmlFor="task-estimate">Estimated hours</Label>
            <Input
              id="task-estimate"
              name="estimatedHours"
              type="number"
              min="0"
              step="0.25"
              value={formik.values.estimatedHours}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.estimatedHours ? (
              <ErrorText>{formik.errors.estimatedHours}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="task-actual">Actual hours</Label>
            <Input
              id="task-actual"
              name="actualHours"
              type="number"
              min="0"
              step="0.25"
              value={formik.values.actualHours}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            />
            {formik.errors.actualHours ? (
              <ErrorText>{formik.errors.actualHours}</ErrorText>
            ) : null}
          </Field>
        </Grid>

        <Field>
          <Label htmlFor="task-description">Description</Label>
          <Textarea
            id="task-description"
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
          <Label>Collaborators</Label>
          <CheckGrid>
            {members.map((member) => (
              <CheckLabel key={member.userId}>
                <input
                  type="checkbox"
                  checked={collaborators.includes(member.userId)}
                  onChange={() =>
                    toggle(collaborators, setCollaborators, member.userId)
                  }
                  disabled={formik.isSubmitting}
                />
                {member.name || member.email}
              </CheckLabel>
            ))}
          </CheckGrid>
        </Field>

        {tasks.length > 0 ? (
          <Field>
            <Label>Depends on</Label>
            <CheckGrid>
              {tasks
                .filter((entry) => entry.id !== task?.id)
                .map((entry) => (
                  <CheckLabel key={entry.id}>
                    <input
                      type="checkbox"
                      checked={dependencies.includes(entry.id)}
                      onChange={() => toggle(dependencies, setDependencies, entry.id)}
                      disabled={formik.isSubmitting}
                    />
                    {entry.title}
                  </CheckLabel>
                ))}
            </CheckGrid>
            <Hint>Dependencies stay inside this project.</Hint>
          </Field>
        ) : null}

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
                ? 'Save task'
                : 'Add task'}
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
