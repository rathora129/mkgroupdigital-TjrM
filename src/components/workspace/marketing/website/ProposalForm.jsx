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

export default function ProposalForm({ options, onDone, onCancel }) {
  const [failure, setFailure] = useState(null);

  const formik = useFormik({
    initialValues: {
      clientId: '',
      pageId: '',
      title: '',
      currentContent: '',
      proposedContent: '',
      ownerUserId: '',
    },
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        const result = await apiRequest('/api/workforce/marketing/proposals', {
          method: 'POST',
          body: {
            clientId: values.clientId,
            pageId: values.pageId || null,
            title: values.title,
            currentContent: values.currentContent || null,
            proposedContent: values.proposedContent,
            ownerUserId: values.ownerUserId || null,
          },
        });
        onDone(result);
      } catch (error) {
        setFailure(error.message);
        helpers.setSubmitting(false);
      }
    },
  });

  const pages = options.pages.filter(
    (page) => !formik.values.clientId || page.clientId === formik.values.clientId,
  );

  function choosePage(pageId) {
    formik.setFieldValue('pageId', pageId);
    const page = options.pages.find((entry) => entry.id === pageId);
    if (page && !formik.values.currentContent) {
      formik.setFieldValue(
        'currentContent',
        page.existingContentNotes || page.pageObjective || '',
      );
    }
  }

  return (
    <form onSubmit={formik.handleSubmit}>
      {failure ? (
        <Notice $tone="danger">
          <ErrorText>{failure}</ErrorText>
        </Notice>
      ) : null}
      <Notice $tone="info">
        <span>
          A proposal is a suggestion. It does not change the page until a person
          edits the site and records evidence.
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
              formik.setFieldValue('pageId', '');
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
          <Label htmlFor="pageId">Page</Label>
          <Select
            id="pageId"
            name="pageId"
            value={formik.values.pageId}
            onChange={(event) => choosePage(event.target.value)}
          >
            <option value="">No page</option>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.pageTitle}
              </option>
            ))}
          </Select>
        </Field>
        <Field style={{ gridColumn: '1 / -1' }}>
          <Label htmlFor="title">Proposal title</Label>
          <Input
            id="title"
            name="title"
            value={formik.values.title}
            onChange={formik.handleChange}
            required
          />
        </Field>
        <Field style={{ gridColumn: '1 / -1' }}>
          <Label htmlFor="currentContent">Current content (original)</Label>
          <Textarea
            id="currentContent"
            name="currentContent"
            rows={5}
            value={formik.values.currentContent}
            onChange={formik.handleChange}
          />
        </Field>
        <Field style={{ gridColumn: '1 / -1' }}>
          <Label htmlFor="proposedContent">Proposed content</Label>
          <Textarea
            id="proposedContent"
            name="proposedContent"
            rows={8}
            value={formik.values.proposedContent}
            onChange={formik.handleChange}
            required
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
      </Grid>
      <Actions>
        <Button type="submit" $primary disabled={formik.isSubmitting}>
          {formik.isSubmitting ? (
            <Loader2 size={14} className="spin" />
          ) : null}
          Create proposal
        </Button>
        <Button type="button" $variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </Actions>
    </form>
  );
}
