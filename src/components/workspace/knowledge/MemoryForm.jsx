'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import { useRouter } from 'next/navigation';
import * as yup from 'yup';
import { Loader2, Save } from 'lucide-react';
import { apiRequest } from '@/lib/ai/client';
import {
  Actions,
  Button,
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
import { MEMORY_TYPE_OPTIONS } from './meta';

const optionalText = (max, message) => yup.string().trim().max(max, message);

const schema = yup.object({
  memoryType: yup.string().required('Choose a memory type.'),
  key: yup
    .string()
    .trim()
    .min(3, 'Key must be at least 3 characters.')
    .max(160, 'Key must be 160 characters or fewer.')
    .required('Key is required.'),
  content: yup
    .string()
    .trim()
    .min(10, 'Content must be at least 10 characters.')
    .max(8_000, 'Content must be 8,000 characters or fewer.')
    .required('Content is required.'),
  confidence: yup.string().required('Choose a confidence level.'),
  status: yup.string(),
  sourceReference: optionalText(300, 'Source reference is too long.'),
  clientId: yup.string(),
  projectId: yup.string(),
  agentId: yup.string(),
  changeNote: optionalText(300, 'Change note must be 300 characters or fewer.'),
});

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export default function MemoryForm({
  mode = 'create',
  memory = null,
  scopeOptions,
  onCancel,
}) {
  const router = useRouter();
  const [failure, setFailure] = useState(null);
  const isEdit = mode === 'edit';

  const formik = useFormik({
    initialValues: {
      memoryType: memory?.memoryType || 'workspace',
      key: memory?.key || '',
      content: memory?.content || '',
      confidence: memory?.confidence || 'medium',
      status: memory?.status || 'active',
      verified: Boolean(memory?.verified),
      sourceReference: memory?.sourceReference || '',
      clientId: memory?.clientId || '',
      projectId: memory?.projectId || '',
      agentId: memory?.agentId || '',
      changeNote: '',
    },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        if (isEdit) {
          await apiRequest(`/api/workforce/memories/${memory.id}`, {
            method: 'PATCH',
            body: {
              key: values.key.trim(),
              content: values.content.trim(),
              confidence: values.confidence,
              verified: values.verified,
              status: values.status,
              sourceReference: textOrNull(values.sourceReference),
              changeNote: textOrNull(values.changeNote),
              expectedVersion: memory.version,
            },
          });
          router.refresh();
          onCancel?.();
        } else {
          const result = await apiRequest('/api/workforce/memories', {
            method: 'POST',
            body: {
              memoryType: values.memoryType,
              key: values.key.trim(),
              content: values.content.trim(),
              confidence: values.confidence,
              verified: values.verified,
              sourceReference: textOrNull(values.sourceReference),
              clientId: values.clientId || null,
              projectId: values.projectId || null,
              agentId: values.agentId || null,
              changeNote: textOrNull(values.changeNote),
            },
          });
          router.push(`/workspace/memory/memories/${result.memory.id}`);
        }
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

  const needsClient = formik.values.memoryType === 'client';
  const needsProject = formik.values.memoryType === 'project';
  const needsAgent = formik.values.memoryType === 'agent';

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={14}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}
        <Notice $tone="info">
          Memories are curated facts, not a transcript. Never store passwords, API
          keys or tokens; content that looks like a secret is rejected.
        </Notice>

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="mem-type">Memory type</Label>
            <Select
              id="mem-type"
              name="memoryType"
              value={formik.values.memoryType}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting || isEdit}
            >
              {MEMORY_TYPE_OPTIONS.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.label}
                </option>
              ))}
            </Select>
            {formik.errors.memoryType ? (
              <ErrorText>{formik.errors.memoryType}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="mem-key">Key</Label>
            <Input
              id="mem-key"
              name="key"
              value={formik.values.key}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
              placeholder="Short, unique label"
              required
            />
            {formik.errors.key ? <ErrorText>{formik.errors.key}</ErrorText> : null}
          </Field>
        </Grid>

        {!isEdit ? (
          <Grid $cols={3}>
            <Field>
              <Label htmlFor="mem-client">Client</Label>
              <Select
                id="mem-client"
                name="clientId"
                value={formik.values.clientId}
                onChange={formik.handleChange}
                disabled={formik.isSubmitting}
              >
                <option value="">{needsClient ? 'Choose a client' : 'None'}</option>
                {scopeOptions.clients.map((client) => (
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
              <Label htmlFor="mem-project">Project</Label>
              <Select
                id="mem-project"
                name="projectId"
                value={formik.values.projectId}
                onChange={formik.handleChange}
                disabled={formik.isSubmitting}
              >
                <option value="">{needsProject ? 'Choose a project' : 'None'}</option>
                {scopeOptions.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
              {formik.errors.projectId ? (
                <ErrorText>{formik.errors.projectId}</ErrorText>
              ) : null}
            </Field>
            <Field>
              <Label htmlFor="mem-agent">Agent</Label>
              <Select
                id="mem-agent"
                name="agentId"
                value={formik.values.agentId}
                onChange={formik.handleChange}
                disabled={formik.isSubmitting}
              >
                <option value="">{needsAgent ? 'Choose an agent' : 'None'}</option>
                {scopeOptions.agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </Select>
              {formik.errors.agentId ? (
                <ErrorText>{formik.errors.agentId}</ErrorText>
              ) : null}
            </Field>
          </Grid>
        ) : null}

        <Field>
          <Label htmlFor="mem-content">Memory content</Label>
          <Textarea
            id="mem-content"
            name="content"
            rows={6}
            value={formik.values.content}
            onChange={formik.handleChange}
            disabled={formik.isSubmitting}
            required
          />
          {formik.errors.content ? (
            <ErrorText>{formik.errors.content}</ErrorText>
          ) : null}
        </Field>

        <Grid $cols={isEdit ? 3 : 2}>
          <Field>
            <Label htmlFor="mem-confidence">Confidence</Label>
            <Select
              id="mem-confidence"
              name="confidence"
              value={formik.values.confidence}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
          {isEdit ? (
            <Field>
              <Label htmlFor="mem-status">Status</Label>
              <Select
                id="mem-status"
                name="status"
                value={formik.values.status}
                onChange={formik.handleChange}
                disabled={formik.isSubmitting}
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="superseded">Superseded</option>
              </Select>
            </Field>
          ) : null}
          <Field>
            <Label htmlFor="mem-source">Source reference</Label>
            <Input
              id="mem-source"
              name="sourceReference"
              value={formik.values.sourceReference}
              onChange={formik.handleChange}
              placeholder="Where this fact came from"
              disabled={formik.isSubmitting}
            />
          </Field>
        </Grid>

        <CheckLabel htmlFor="mem-verified">
          <input
            id="mem-verified"
            type="checkbox"
            name="verified"
            checked={formik.values.verified}
            onChange={formik.handleChange}
            disabled={formik.isSubmitting}
          />
          Verified by a person
        </CheckLabel>
        <Hint>
          Unverified memories are labelled as such in every AI context package.
        </Hint>

        <Field>
          <Label htmlFor="mem-note">Change note</Label>
          <Input
            id="mem-note"
            name="changeNote"
            value={formik.values.changeNote}
            onChange={formik.handleChange}
            disabled={formik.isSubmitting}
          />
        </Field>

        <Actions>
          <Button type="submit" $primary disabled={formik.isSubmitting}>
            {formik.isSubmitting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}
            {isEdit ? 'Save changes' : 'Create memory'}
          </Button>
          {onCancel ? (
            <Button
              type="button"
              $variant="ghost"
              onClick={onCancel}
              disabled={formik.isSubmitting}
            >
              Cancel
            </Button>
          ) : null}
        </Actions>
      </Stack>
    </form>
  );
}
