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

export default function PageForm({ options, onDone, onCancel }) {
  const [failure, setFailure] = useState(null);

  const formik = useFormik({
    initialValues: {
      clientId: '',
      pageTitle: '',
      pageUrl: '',
      pageType: '',
      pageObjective: '',
      existingContentNotes: '',
      seoTitle: '',
      metaDescription: '',
      ctaRecommendations: '',
      mediaRequirements: '',
      internalLinkRecommendations: '',
    },
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        const result = await apiRequest(
          '/api/workforce/marketing/website-pages',
          {
            method: 'POST',
            body: {
              ...values,
              pageType: values.pageType || null,
              pageObjective: values.pageObjective || null,
              existingContentNotes: values.existingContentNotes || null,
              seoTitle: values.seoTitle || null,
              metaDescription: values.metaDescription || null,
              ctaRecommendations: values.ctaRecommendations || null,
              mediaRequirements: values.mediaRequirements || null,
              internalLinkRecommendations:
                values.internalLinkRecommendations || null,
            },
          },
        );
        onDone(result);
      } catch (error) {
        setFailure(error.message);
        helpers.setSubmitting(false);
      }
    },
  });

  return (
    <form onSubmit={formik.handleSubmit}>
      {failure ? (
        <Notice $tone="danger">
          <ErrorText>{failure}</ErrorText>
        </Notice>
      ) : null}
      <Grid $cols={2}>
        <Field>
          <Label htmlFor="clientId">Client</Label>
          <Select
            id="clientId"
            name="clientId"
            value={formik.values.clientId}
            onChange={formik.handleChange}
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
          <Label htmlFor="pageType">Page type</Label>
          <Input
            id="pageType"
            name="pageType"
            value={formik.values.pageType}
            onChange={formik.handleChange}
            placeholder="Service, location, landing page…"
          />
        </Field>
        <Field>
          <Label htmlFor="pageTitle">Page title</Label>
          <Input
            id="pageTitle"
            name="pageTitle"
            value={formik.values.pageTitle}
            onChange={formik.handleChange}
            required
          />
        </Field>
        <Field>
          <Label htmlFor="pageUrl">Page URL</Label>
          <Input
            id="pageUrl"
            name="pageUrl"
            placeholder="https://"
            value={formik.values.pageUrl}
            onChange={formik.handleChange}
            required
          />
        </Field>
        <Field style={{ gridColumn: '1 / -1' }}>
          <Label htmlFor="pageObjective">Page objective</Label>
          <Textarea
            id="pageObjective"
            name="pageObjective"
            rows={2}
            value={formik.values.pageObjective}
            onChange={formik.handleChange}
          />
        </Field>
        <Field style={{ gridColumn: '1 / -1' }}>
          <Label htmlFor="existingContentNotes">
            Existing content notes (original preserved)
          </Label>
          <Textarea
            id="existingContentNotes"
            name="existingContentNotes"
            rows={5}
            value={formik.values.existingContentNotes}
            onChange={formik.handleChange}
          />
        </Field>
        <Field>
          <Label htmlFor="seoTitle">SEO title</Label>
          <Input
            id="seoTitle"
            name="seoTitle"
            value={formik.values.seoTitle}
            onChange={formik.handleChange}
          />
        </Field>
        <Field>
          <Label htmlFor="metaDescription">Meta description</Label>
          <Textarea
            id="metaDescription"
            name="metaDescription"
            rows={2}
            value={formik.values.metaDescription}
            onChange={formik.handleChange}
          />
        </Field>
        <Field style={{ gridColumn: '1 / -1' }}>
          <Label htmlFor="ctaRecommendations">CTA recommendations</Label>
          <Textarea
            id="ctaRecommendations"
            name="ctaRecommendations"
            rows={2}
            value={formik.values.ctaRecommendations}
            onChange={formik.handleChange}
          />
        </Field>
        <Field>
          <Label htmlFor="mediaRequirements">Media requirements</Label>
          <Textarea
            id="mediaRequirements"
            name="mediaRequirements"
            rows={2}
            value={formik.values.mediaRequirements}
            onChange={formik.handleChange}
          />
        </Field>
        <Field>
          <Label htmlFor="internalLinkRecommendations">
            Internal link recommendations
          </Label>
          <Textarea
            id="internalLinkRecommendations"
            name="internalLinkRecommendations"
            rows={2}
            value={formik.values.internalLinkRecommendations}
            onChange={formik.handleChange}
          />
        </Field>
      </Grid>
      <Actions>
        <Button type="submit" $primary disabled={formik.isSubmitting}>
          {formik.isSubmitting ? (
            <Loader2 size={14} className="spin" />
          ) : null}
          Add page
        </Button>
        <Button type="button" $variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </Actions>
    </form>
  );
}
