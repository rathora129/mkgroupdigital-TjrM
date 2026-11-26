'use client';

import { useState } from 'react';
import { useFormik } from 'formik';
import { Loader2 } from 'lucide-react';
import {
  Actions,
  Button,
  ErrorText,
  Field,
  Grid,
  Input,
  Label,
  Notice,
  Select,
  Textarea,
} from '@/components/workspace/ai/primitives';
import { apiRequest } from '@/lib/ai/client';
import {
  CONTENT_PLATFORMS,
  CONTENT_TYPES,
} from '@/lib/marketing/constants';
import { toIsoDate } from '../meta';

export default function ContentForm({ options, onDone, onCancel }) {
  const [failure, setFailure] = useState(null);

  const formik = useFormik({
    initialValues: {
      clientId: '',
      campaignId: '',
      projectId: '',
      contentType: 'blog_draft',
      title: '',
      body: '',
      targetAudience: '',
      targetKeyword: '',
      targetPlatform: '',
      language: 'en',
      ownerUserId: '',
      scheduledFor: '',
      dueDate: '',
      status: 'draft',
    },
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        const result = await apiRequest('/api/workforce/marketing/content', {
          method: 'POST',
          body: {
            clientId: values.clientId,
            campaignId: values.campaignId || null,
            projectId: values.projectId || null,
            contentType: values.contentType,
            title: values.title,
            body: values.body,
            targetAudience: values.targetAudience || null,
            targetKeyword: values.targetKeyword || null,
            targetPlatform: values.targetPlatform || null,
            language: values.language || 'en',
            ownerUserId: values.ownerUserId || null,
            scheduledFor: toIsoDate(values.scheduledFor),
            dueDate: toIsoDate(values.dueDate),
            status: values.status,
          },
        });
        onDone(result);
      } catch (error) {
        setFailure(error.message);
        helpers.setSubmitting(false);
      }
    },
  });

  const campaigns = options.campaigns.filter(
    (campaign) => !formik.values.clientId || campaign.clientId === formik.values.clientId,
  );
  const projects = options.projects.filter(
    (project) => !formik.values.clientId || project.clientId === formik.values.clientId,
  );

  return (
    <form onSubmit={formik.handleSubmit}>
      {failure ? (
        <Notice $tone="danger">
          <ErrorText>{failure}</ErrorText>
        </Notice>
      ) : null}
      <Notice $tone="info">
        <span>
          Draft content is internal. Nothing is posted or emailed, and unsupported
          facts must be marked for verification instead of invented.
        </span>
      </Notice>

      <Grid $cols={2}>
        <Field>
          <Label htmlFor="clientId">Client</Label>
          <Select
            id="clientId"
            name="clientId"
            value={formik.values.clientId}
            onChange={(event) => {
              formik.handleChange(event);
              formik.setFieldValue('campaignId', '');
              formik.setFieldValue('projectId', '');
            }}
            required
          >
            <option value="">Choose a client</option>
            {options.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.companyName} ({client.reference})
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label htmlFor="contentType">Content type</Label>
          <Select
            id="contentType"
            name="contentType"
            value={formik.values.contentType}
            onChange={formik.handleChange}
          >
            {CONTENT_TYPES.map((type) => (
              <option key={type.key} value={type.key}>
                {type.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label htmlFor="campaignId">Campaign (optional)</Label>
          <Select
            id="campaignId"
            name="campaignId"
            value={formik.values.campaignId}
            onChange={formik.handleChange}
          >
            <option value="">No campaign</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label htmlFor="projectId">Project (optional)</Label>
          <Select
            id="projectId"
            name="projectId"
            value={formik.values.projectId}
            onChange={formik.handleChange}
          >
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field style={{ gridColumn: '1 / -1' }}>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            value={formik.values.title}
            onChange={formik.handleChange}
            required
          />
        </Field>
        <Field style={{ gridColumn: '1 / -1' }}>
          <Label htmlFor="body">Draft content</Label>
          <Textarea
            id="body"
            name="body"
            rows={10}
            value={formik.values.body}
            onChange={formik.handleChange}
            required
          />
        </Field>
        <Field>
          <Label htmlFor="targetAudience">Target audience</Label>
          <Input
            id="targetAudience"
            name="targetAudience"
            value={formik.values.targetAudience}
            onChange={formik.handleChange}
          />
        </Field>
        <Field>
          <Label htmlFor="targetKeyword">Target keyword</Label>
          <Input
            id="targetKeyword"
            name="targetKeyword"
            value={formik.values.targetKeyword}
            onChange={formik.handleChange}
          />
        </Field>
        <Field>
          <Label htmlFor="targetPlatform">Planned platform</Label>
          <Select
            id="targetPlatform"
            name="targetPlatform"
            value={formik.values.targetPlatform}
            onChange={formik.handleChange}
          >
            <option value="">Not set</option>
            {CONTENT_PLATFORMS.map((platform) => (
              <option key={platform.key} value={platform.key}>
                {platform.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label htmlFor="language">Language</Label>
          <Input
            id="language"
            name="language"
            value={formik.values.language}
            onChange={formik.handleChange}
          />
        </Field>
        <Field>
          <Label htmlFor="ownerUserId">Owner (optional)</Label>
          <Select
            id="ownerUserId"
            name="ownerUserId"
            value={formik.values.ownerUserId}
            onChange={formik.handleChange}
          >
            <option value="">Unassigned</option>
            {options.members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name || member.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label htmlFor="status">Starting state</Label>
          <Select
            id="status"
            name="status"
            value={formik.values.status}
            onChange={formik.handleChange}
          >
            <option value="draft">Draft</option>
            <option value="idea">Idea</option>
          </Select>
        </Field>
        <Field>
          <Label htmlFor="scheduledFor">Planned date (optional)</Label>
          <Input
            id="scheduledFor"
            name="scheduledFor"
            type="date"
            value={formik.values.scheduledFor}
            onChange={formik.handleChange}
          />
        </Field>
        <Field>
          <Label htmlFor="dueDate">Due date (optional)</Label>
          <Input
            id="dueDate"
            name="dueDate"
            type="date"
            value={formik.values.dueDate}
            onChange={formik.handleChange}
          />
        </Field>
      </Grid>

      <Actions>
        <Button type="submit" $primary disabled={formik.isSubmitting}>
          {formik.isSubmitting ? (
            <Loader2 size={14} className="spin" />
          ) : null}
          Create draft
        </Button>
        <Button type="button" $variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </Actions>
    </form>
  );
}
