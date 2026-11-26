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
import { CATEGORY_OPTIONS, tagsFromText } from './meta';

const optionalText = (max, message) => yup.string().trim().max(max, message);

const schema = yup.object({
  title: yup
    .string()
    .trim()
    .min(3, 'Title must be at least 3 characters.')
    .max(200, 'Title must be 200 characters or fewer.')
    .required('Title is required.'),
  category: yup.string().required('Choose a category.'),
  status: yup.string().required('Choose a status.'),
  provenance: yup.string().required('Choose a provenance.'),
  content: yup
    .string()
    .trim()
    .min(10, 'Content must be at least 10 characters.')
    .max(200_000, 'Content must be 200,000 characters or fewer.')
    .required('Content is required.'),
  summary: optionalText(600, 'Summary must be 600 characters or fewer.'),
  sourceReference: optionalText(300, 'Source reference is too long.'),
  tags: optionalText(400, 'That tag list is too long.'),
  clientId: yup.string(),
  projectId: yup.string(),
  changeNote: optionalText(300, 'Change note must be 300 characters or fewer.'),
});

function textOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export default function KnowledgeEntryForm({
  mode = 'create',
  entry = null,
  scopeOptions,
  onCancel,
}) {
  const router = useRouter();
  const [failure, setFailure] = useState(null);
  const isEdit = mode === 'edit';

  const formik = useFormik({
    initialValues: {
      title: entry?.title || '',
      category: entry?.category || 'company_profile',
      status: entry?.status || 'draft',
      provenance: entry?.provenance || 'unverified',
      content: entry?.content || '',
      summary: entry?.summary || '',
      sourceReference: entry?.sourceReference || '',
      tags: Array.isArray(entry?.tags) ? entry.tags.join(', ') : '',
      clientId: entry?.clientId || '',
      projectId: entry?.projectId || '',
      changeNote: '',
    },
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        const payload = {
          title: values.title.trim(),
          category: values.category,
          status: values.status,
          provenance: values.provenance,
          content: values.content.trim(),
          summary: textOrNull(values.summary),
          sourceReference: textOrNull(values.sourceReference),
          tags: tagsFromText(values.tags),
          clientId: values.clientId || null,
          projectId: values.projectId || null,
          changeNote: textOrNull(values.changeNote),
        };
        if (isEdit) {
          await apiRequest(`/api/workforce/knowledge/${entry.id}`, {
            method: 'PATCH',
            body: { ...payload, expectedVersion: entry.version },
          });
          router.refresh();
          onCancel?.();
        } else {
          const result = await apiRequest('/api/workforce/knowledge', {
            method: 'POST',
            body: payload,
          });
          router.push(`/workspace/memory/knowledge/${result.entry.id}`);
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

  return (
    <form onSubmit={formik.handleSubmit}>
      <Stack $gap={14}>
        {failure ? <Notice $tone="danger">{failure}</Notice> : null}

        <Notice $tone="info">
          Only published entries are supplied to AI runs. Never store passwords,
          API keys or tokens here; such content is rejected.
        </Notice>

        <Field>
          <Label htmlFor="kn-title">Title</Label>
          <Input
            id="kn-title"
            name="title"
            value={formik.values.title}
            onChange={formik.handleChange}
            disabled={formik.isSubmitting}
            required
          />
          {formik.errors.title ? <ErrorText>{formik.errors.title}</ErrorText> : null}
        </Field>

        <Grid $cols={3}>
          <Field>
            <Label htmlFor="kn-category">Category</Label>
            <Select
              id="kn-category"
              name="category"
              value={formik.values.category}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="kn-status">Status</Label>
            <Select
              id="kn-status"
              name="status"
              value={formik.values.status}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
          <Field>
            <Label htmlFor="kn-provenance">Provenance</Label>
            <Select
              id="kn-provenance"
              name="provenance"
              value={formik.values.provenance}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
            >
              <option value="verified">Verified</option>
              <option value="source_derived">Source-derived</option>
              <option value="ai_generated">AI-generated</option>
              <option value="unverified">Unverified</option>
            </Select>
          </Field>
        </Grid>

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="kn-client">Client scope</Label>
            <Select
              id="kn-client"
              name="clientId"
              value={formik.values.clientId}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
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
            <Label htmlFor="kn-project">Project scope</Label>
            <Select
              id="kn-project"
              name="projectId"
              value={formik.values.projectId}
              onChange={formik.handleChange}
              disabled={formik.isSubmitting}
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
          <Label htmlFor="kn-summary">Summary</Label>
          <Textarea
            id="kn-summary"
            name="summary"
            rows={2}
            value={formik.values.summary}
            onChange={formik.handleChange}
            disabled={formik.isSubmitting}
          />
          {formik.errors.summary ? (
            <ErrorText>{formik.errors.summary}</ErrorText>
          ) : null}
        </Field>

        <Field>
          <Label htmlFor="kn-content">Content</Label>
          <Textarea
            id="kn-content"
            name="content"
            rows={12}
            value={formik.values.content}
            onChange={formik.handleChange}
            disabled={formik.isSubmitting}
            required
          />
          {formik.errors.content ? (
            <ErrorText>{formik.errors.content}</ErrorText>
          ) : null}
        </Field>

        <Grid $cols={2}>
          <Field>
            <Label htmlFor="kn-source">Source reference</Label>
            <Input
              id="kn-source"
              name="sourceReference"
              value={formik.values.sourceReference}
              onChange={formik.handleChange}
              placeholder="URL, document name or system"
              disabled={formik.isSubmitting}
            />
            {formik.errors.sourceReference ? (
              <ErrorText>{formik.errors.sourceReference}</ErrorText>
            ) : null}
          </Field>
          <Field>
            <Label htmlFor="kn-tags">Tags</Label>
            <Input
              id="kn-tags"
              name="tags"
              value={formik.values.tags}
              onChange={formik.handleChange}
              placeholder="comma, separated, tags"
              disabled={formik.isSubmitting}
            />
            {formik.errors.tags ? <ErrorText>{formik.errors.tags}</ErrorText> : null}
          </Field>
        </Grid>

        <Field>
          <Label htmlFor="kn-note">Change note</Label>
          <Input
            id="kn-note"
            name="changeNote"
            value={formik.values.changeNote}
            onChange={formik.handleChange}
            placeholder={isEdit ? 'Why this changed' : 'Where this came from'}
            disabled={formik.isSubmitting}
          />
          <Hint>
            Stored with the new version so the history explains what changed.
          </Hint>
        </Field>

        <Actions>
          <Button type="submit" $primary disabled={formik.isSubmitting}>
            {formik.isSubmitting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}
            {isEdit ? 'Save changes' : 'Create entry'}
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
