'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Form, Formik } from 'formik';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Loader2,
  Mail,
  MessageCircle,
  RotateCcw,
  Send,
} from 'lucide-react';
import styled from 'styled-components';
import Button from '@/components/ui/Button';
import { contactSchema, initialContactValues } from '@/lib/contactSchema';
import { prepareEnquiry } from '@/lib/whatsappEnquiry';
import { budgetOptions, contactMethodOptions } from '@/data/content';
import {
  industryOptions,
  projectTypes,
  serviceInterests,
  timelineOptions,
} from '@/data/enquiry';
import siteConfig from '@/data/site';
import { media } from '@/styles/theme';

const FormEl = styled(Form)`
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;

  ${media.down('sm')} {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  ${({ $full }) => $full && 'grid-column: 1 / -1;'}
`;

const Fieldset = styled.fieldset`
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  grid-column: 1 / -1;
  border: 0;
  padding: 0;
  margin: 0;
`;

const Label = styled.label`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textSoft};

  span {
    font-size: 0.64rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: none;
    color: ${({ theme }) => theme.colors.faint};
  }
`;

const Legend = styled.legend`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0;
  margin-bottom: 0.45rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textSoft};

  span {
    font-size: 0.64rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: none;
    color: ${({ theme }) => theme.colors.faint};
  }
`;

const fieldStyles = `
  width: 100%;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  border: 1px solid ${'rgba(255,255,255,0.1)'};
  background: rgba(255, 255, 255, 0.025);
  color: #F4F4F7;
  font-size: 0.92rem;
  line-height: 1.5;
  transition: border-color 0.25s ease, background 0.25s ease, box-shadow 0.25s ease;
  outline: none;

  &::placeholder {
    color: #5c5c6e;
  }

  &:hover {
    border-color: rgba(255, 255, 255, 0.18);
  }

  &:focus {
    border-color: rgba(124, 92, 255, 0.55);
    background: rgba(124, 92, 255, 0.045);
    box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.11);
  }
`;

const Input = styled.input`
  ${fieldStyles}
  border-color: ${({ theme, $error }) =>
    $error ? theme.colors.danger : 'rgba(255,255,255,0.1)'};
`;

const SelectWrap = styled.div`
  position: relative;

  svg {
    position: absolute;
    top: 50%;
    right: 1rem;
    transform: translateY(-50%);
    pointer-events: none;
    color: ${({ theme }) => theme.colors.faint};
  }
`;

const Select = styled.select`
  ${fieldStyles}
  appearance: none;
  padding-right: 2.6rem;
  cursor: pointer;
  border-color: ${({ theme, $error }) =>
    $error ? theme.colors.danger : 'rgba(255,255,255,0.1)'};

  option {
    background: ${({ theme }) => theme.colors.bgRaised};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Textarea = styled.textarea`
  ${fieldStyles}
  min-height: 160px;
  resize: vertical;
  border-color: ${({ theme, $error }) =>
    $error ? theme.colors.danger : 'rgba(255,255,255,0.1)'};
`;

const ServiceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;

  ${media.down('md')} {
    grid-template-columns: 1fr 1fr;
  }

  ${media.down('xs')} {
    grid-template-columns: 1fr;
  }
`;

const ServiceOption = styled.label`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.62rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.02);
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.8rem;
  line-height: 1.35;
  cursor: pointer;
  transition:
    border-color 0.25s ease,
    background 0.25s ease,
    color 0.25s ease;

  input {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    accent-color: #7c5cff;
  }

  &:hover {
    border-color: rgba(255, 255, 255, 0.18);
  }

  &:has(input:checked) {
    border-color: rgba(124, 92, 255, 0.5);
    background: rgba(124, 92, 255, 0.09);
    color: ${({ theme }) => theme.colors.text};
  }

  &:focus-within {
    outline: 2px solid rgba(124, 92, 255, 0.55);
    outline-offset: 2px;
  }
`;

const ErrorText = styled.p`
  font-size: 0.72rem;
  line-height: 1.45;
  color: ${({ theme }) => theme.colors.danger};
`;

const MethodGroup = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
`;

const Method = styled.label`
  position: relative;
  cursor: pointer;

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  span {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 46px;
    padding: 0.6rem 0.8rem;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.025);
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 0.86rem;
    transition:
      border-color 0.25s ease,
      background 0.25s ease,
      color 0.25s ease;
  }

  &:hover span {
    border-color: rgba(255, 255, 255, 0.18);
  }

  input:checked + span {
    border-color: rgba(124, 92, 255, 0.55);
    background: rgba(124, 92, 255, 0.1);
    color: ${({ theme }) => theme.colors.text};
  }

  input:focus-visible + span {
    outline: 2px solid rgba(124, 92, 255, 0.6);
    outline-offset: 2px;
  }
`;

const Counter = styled.span`
  align-self: flex-end;
  font-size: 0.66rem;
  color: ${({ theme }) => theme.colors.faint};
`;

const Honeypot = styled.div`
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
`;

const SubmitRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-top: 0.25rem;
`;

const SubmitNote = styled.p`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.8rem 0.95rem;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid rgba(87, 214, 164, 0.2);
  background: rgba(87, 214, 164, 0.05);
  font-size: 0.78rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.textSoft};

  svg {
    flex-shrink: 0;
    margin-top: 0.15rem;
    color: ${({ theme }) => theme.colors.success};
  }
`;

const Legal = styled.p`
  font-size: 0.72rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.faint};

  a {
    color: ${({ theme }) => theme.colors.textSoft};
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  a:hover {
    color: ${({ theme }) => theme.colors.violetSoft};
  }
`;

const PreparedPanel = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1rem;
  padding: clamp(1.75rem, 4vw, 2.5rem);
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.violetLine};
  background:
    radial-gradient(420px circle at 100% 0%, rgba(124, 92, 255, 0.12), transparent 65%),
    ${({ theme }) => theme.colors.card};

  > svg {
    color: ${({ theme }) => theme.colors.violetSoft};
  }

  h3 {
    font-size: clamp(1.35rem, 3vw, 1.7rem);
    letter-spacing: -0.03em;
  }

  p {
    max-width: 560px;
    font-size: 0.92rem;
    line-height: 1.7;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const MessageBox = styled.pre`
  width: 100%;
  max-height: 320px;
  overflow: auto;
  margin: 0;
  padding: 1rem 1.1rem;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.colors.line};
  background: rgba(255, 255, 255, 0.02);
  color: ${({ theme }) => theme.colors.textSoft};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.76rem;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
`;

const PanelActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  padding-top: 0.25rem;
`;

const EmailNote = styled.p`
  display: inline-flex;
  align-items: flex-start;
  gap: 0.45rem;
  font-size: 0.8rem;
  line-height: 1.6;

  a {
    color: ${({ theme }) => theme.colors.violetSoft};
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  svg {
    flex-shrink: 0;
    margin-top: 0.15rem;
  }
`;

const mailtoFor = (message, values) =>
  `mailto:${siteConfig.email}?subject=${encodeURIComponent(
    `Website enquiry — ${values.company || values.fullName}`,
  )}&body=${encodeURIComponent(message)}`;

export default function ContactForm() {
  const [prepared, setPrepared] = useState(null);
  const [copied, setCopied] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const copyMessage = async (message) => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      return;
    } catch {
      // Older browsers: fall back to a temporary textarea selection.
    }
    const area = document.createElement('textarea');
    area.value = message;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      setCopied(true);
    } catch {
      setCopied(false);
    }
    document.body.removeChild(area);
  };

  const startOver = () => {
    setPrepared(null);
    setCopied(false);
    setFormKey((key) => key + 1);
  };

  if (prepared) {
    return (
      <PreparedPanel aria-live="polite">
        {prepared.tooLong ? (
          <AlertCircle size={30} strokeWidth={1.8} />
        ) : (
          <CheckCircle2 size={30} strokeWidth={1.8} />
        )}
        <h3>
          {prepared.tooLong
            ? 'This enquiry is longer than a WhatsApp link should carry.'
            : 'Your enquiry is ready in WhatsApp.'}
        </h3>
        <p>
          {prepared.tooLong
            ? 'Nothing has been shortened. Copy the full enquiry or send it by email — or open WhatsApp with a short summary and paste the full details into the chat.'
            : 'WhatsApp has opened in a new tab with every field filled in. Press Send inside WhatsApp to deliver it — nothing is sent until you do.'}
        </p>
        <MessageBox>{prepared.message}</MessageBox>
        <PanelActions>
          {prepared.tooLong ? (
            <Button
              href={prepared.shortUrl}
              external
              size="md"
              icon={<MessageCircle size={16} strokeWidth={1.8} />}
              arrow={false}
            >
              Send summary on WhatsApp
            </Button>
          ) : (
            <Button
              href={prepared.url}
              external
              size="md"
              icon={<MessageCircle size={16} strokeWidth={1.8} />}
              arrow={false}
            >
              Open WhatsApp again
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => copyMessage(prepared.message)}
            icon={
              copied ? (
                <Check size={16} strokeWidth={2} />
              ) : (
                <Copy size={16} strokeWidth={1.8} />
              )
            }
            arrow={false}
          >
            {copied ? 'Copied' : 'Copy full message'}
          </Button>
          <Button
            href={mailtoFor(prepared.message, prepared.values)}
            variant="secondary"
            icon={<Mail size={16} strokeWidth={1.8} />}
            arrow={false}
          >
            Email this enquiry
          </Button>
          <Button
            variant="ghost"
            onClick={startOver}
            icon={<RotateCcw size={15} strokeWidth={1.8} />}
            arrow={false}
          >
            Start a new enquiry
          </Button>
        </PanelActions>
        <EmailNote>
          <Mail size={14} />
          <span>
            Prefer email? Write to{' '}
            <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a> or
            call{' '}
            <a href={siteConfig.phoneHref}>{siteConfig.phone}</a>.
          </span>
        </EmailNote>
      </PreparedPanel>
    );
  }

  return (
    <Formik
      key={formKey}
      initialValues={initialContactValues}
      validationSchema={contactSchema}
      onSubmit={(values, { setSubmitting }) => {
        if (values.website) {
          setSubmitting(false);
          return;
        }

        const payload = Object.fromEntries(
          Object.entries(values).map(([key, value]) => [
            key,
            typeof value === 'string' ? value.trim() : value,
          ]),
        );

        const result = prepareEnquiry(payload);
        setPrepared({ ...result, values: payload });
        setCopied(false);

        if (!result.tooLong) {
          window.open(result.url, '_blank', 'noopener,noreferrer');
        }

        setSubmitting(false);
      }}
    >
      {({
        values,
        errors,
        touched,
        isSubmitting,
        handleChange,
        handleBlur,
        setFieldValue,
      }) => {
        const errorFor = (name) =>
          touched[name] && errors[name] ? errors[name] : null;

        return (
          <FormEl noValidate aria-busy={isSubmitting}>
            <Grid>
              <Field>
                <Label htmlFor="fullName">
                  Full name <span>Required</span>
                </Label>
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  value={values.fullName}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errorFor('fullName'))}
                  aria-describedby={errorFor('fullName') ? 'fullName-error' : undefined}
                  $error={Boolean(errorFor('fullName'))}
                />
                {errorFor('fullName') ? (
                  <ErrorText id="fullName-error">{errorFor('fullName')}</ErrorText>
                ) : null}
              </Field>

              <Field>
                <Label htmlFor="company">
                  Company / business name <span>Optional</span>
                </Label>
                <Input
                  id="company"
                  name="company"
                  type="text"
                  autoComplete="organization"
                  placeholder="Leave blank if you have not registered one yet"
                  value={values.company}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errorFor('company'))}
                  aria-describedby={errorFor('company') ? 'company-error' : undefined}
                  $error={Boolean(errorFor('company'))}
                />
                {errorFor('company') ? (
                  <ErrorText id="company-error">{errorFor('company')}</ErrorText>
                ) : null}
              </Field>

              <Field>
                <Label htmlFor="mobile">
                  Mobile number <span>Required</span>
                </Label>
                <Input
                  id="mobile"
                  name="mobile"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+91 00000 00000"
                  value={values.mobile}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errorFor('mobile'))}
                  aria-describedby={errorFor('mobile') ? 'mobile-error' : undefined}
                  $error={Boolean(errorFor('mobile'))}
                />
                {errorFor('mobile') ? (
                  <ErrorText id="mobile-error">{errorFor('mobile')}</ErrorText>
                ) : null}
              </Field>

              <Field>
                <Label htmlFor="whatsapp">
                  WhatsApp number <span>Optional</span>
                </Label>
                <Input
                  id="whatsapp"
                  name="whatsapp"
                  type="tel"
                  inputMode="tel"
                  placeholder="If different from your mobile"
                  value={values.whatsapp}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errorFor('whatsapp'))}
                  aria-describedby={errorFor('whatsapp') ? 'whatsapp-error' : undefined}
                  $error={Boolean(errorFor('whatsapp'))}
                />
                {errorFor('whatsapp') ? (
                  <ErrorText id="whatsapp-error">{errorFor('whatsapp')}</ErrorText>
                ) : null}
              </Field>

              <Field>
                <Label htmlFor="email">
                  Email address <span>Optional</span>
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@gmail.com"
                  value={values.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errorFor('email'))}
                  aria-describedby={errorFor('email') ? 'email-error' : undefined}
                  $error={Boolean(errorFor('email'))}
                />
                {errorFor('email') ? (
                  <ErrorText id="email-error">{errorFor('email')}</ErrorText>
                ) : null}
              </Field>

              <Field>
                <Label htmlFor="location">
                  Country / city <span>Optional</span>
                </Label>
                <Input
                  id="location"
                  name="location"
                  type="text"
                  autoComplete="address-level2"
                  placeholder="e.g. Delhi, India"
                  value={values.location}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errorFor('location'))}
                  aria-describedby={errorFor('location') ? 'location-error' : undefined}
                  $error={Boolean(errorFor('location'))}
                />
                {errorFor('location') ? (
                  <ErrorText id="location-error">{errorFor('location')}</ErrorText>
                ) : null}
              </Field>

              <Field>
                <Label htmlFor="industry">Business industry</Label>
                <SelectWrap>
                  <Select
                    id="industry"
                    name="industry"
                    value={values.industry}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    aria-invalid={Boolean(errorFor('industry'))}
                    aria-describedby={errorFor('industry') ? 'industry-error' : undefined}
                    $error={Boolean(errorFor('industry'))}
                  >
                    <option value="">Select an industry</option>
                    {industryOptions.map((industry) => (
                      <option key={industry} value={industry}>
                        {industry}
                      </option>
                    ))}
                  </Select>
                  <ChevronDown size={16} />
                </SelectWrap>
                {errorFor('industry') ? (
                  <ErrorText id="industry-error">{errorFor('industry')}</ErrorText>
                ) : null}
              </Field>

              <Field>
                <Label htmlFor="projectType">Project type</Label>
                <SelectWrap>
                  <Select
                    id="projectType"
                    name="projectType"
                    value={values.projectType}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    aria-invalid={Boolean(errorFor('projectType'))}
                    aria-describedby={errorFor('projectType') ? 'projectType-error' : undefined}
                    $error={Boolean(errorFor('projectType'))}
                  >
                    <option value="">Select a project type</option>
                    {projectTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>
                  <ChevronDown size={16} />
                </SelectWrap>
                {errorFor('projectType') ? (
                  <ErrorText id="projectType-error">{errorFor('projectType')}</ErrorText>
                ) : null}
              </Field>

              <Fieldset>
                <Legend id="services-label">
                  Interested service <span>Select all that apply · Required</span>
                </Legend>
                <ServiceGrid
                  role="group"
                  aria-labelledby="services-label"
                  aria-describedby={errorFor('services') ? 'services-error' : undefined}
                >
                  {serviceInterests.map((service) => (
                    <ServiceOption key={service}>
                      <input
                        type="checkbox"
                        name="services"
                        value={service}
                        checked={values.services.includes(service)}
                        onChange={handleChange}
                        onBlur={handleBlur}
                      />
                      {service}
                    </ServiceOption>
                  ))}
                </ServiceGrid>
                {errorFor('services') ? (
                  <ErrorText id="services-error">{errorFor('services')}</ErrorText>
                ) : null}
              </Fieldset>

              <Field>
                <Label htmlFor="existingWebsite">
                  Existing website URL <span>Optional</span>
                </Label>
                <Input
                  id="existingWebsite"
                  name="existingWebsite"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://example.com"
                  value={values.existingWebsite}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errorFor('existingWebsite'))}
                  aria-describedby={
                    errorFor('existingWebsite') ? 'existingWebsite-error' : undefined
                  }
                  $error={Boolean(errorFor('existingWebsite'))}
                />
                {errorFor('existingWebsite') ? (
                  <ErrorText id="existingWebsite-error">
                    {errorFor('existingWebsite')}
                  </ErrorText>
                ) : null}
              </Field>

              <Field>
                <Label htmlFor="budget">Estimated budget</Label>
                <SelectWrap>
                  <Select
                    id="budget"
                    name="budget"
                    value={values.budget}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    aria-invalid={Boolean(errorFor('budget'))}
                    aria-describedby={errorFor('budget') ? 'budget-error' : undefined}
                    $error={Boolean(errorFor('budget'))}
                  >
                    <option value="">Select a budget range</option>
                    {budgetOptions.map((budget) => (
                      <option key={budget} value={budget}>
                        {budget}
                      </option>
                    ))}
                  </Select>
                  <ChevronDown size={16} />
                </SelectWrap>
                {errorFor('budget') ? (
                  <ErrorText id="budget-error">{errorFor('budget')}</ErrorText>
                ) : null}
              </Field>

              <Field>
                <Label htmlFor="timeline">Expected timeline</Label>
                <SelectWrap>
                  <Select
                    id="timeline"
                    name="timeline"
                    value={values.timeline}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    aria-invalid={Boolean(errorFor('timeline'))}
                    aria-describedby={errorFor('timeline') ? 'timeline-error' : undefined}
                    $error={Boolean(errorFor('timeline'))}
                  >
                    <option value="">Select a timeline</option>
                    {timelineOptions.map((timeline) => (
                      <option key={timeline} value={timeline}>
                        {timeline}
                      </option>
                    ))}
                  </Select>
                  <ChevronDown size={16} />
                </SelectWrap>
                {errorFor('timeline') ? (
                  <ErrorText id="timeline-error">{errorFor('timeline')}</ErrorText>
                ) : null}
              </Field>

              <Field $full>
                <Label id="contact-method-label">Preferred contact method</Label>
                <MethodGroup role="radiogroup" aria-labelledby="contact-method-label">
                  {contactMethodOptions.map((method) => (
                    <Method key={method}>
                      <input
                        type="radio"
                        name="contactMethod"
                        value={method}
                        checked={values.contactMethod === method}
                        onChange={handleChange}
                        onBlur={handleBlur}
                      />
                      <span>{method}</span>
                    </Method>
                  ))}
                </MethodGroup>
                {errorFor('contactMethod') ? (
                  <ErrorText id="contactMethod-error">
                    {errorFor('contactMethod')}
                  </ErrorText>
                ) : null}
              </Field>

              <Field>
                <Label htmlFor="preferredMeeting">
                  Preferred date / time <span>Optional</span>
                </Label>
                <Input
                  id="preferredMeeting"
                  name="preferredMeeting"
                  type="text"
                  placeholder="e.g. Weekdays after 5pm"
                  value={values.preferredMeeting}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errorFor('preferredMeeting'))}
                  aria-describedby={
                    errorFor('preferredMeeting') ? 'preferredMeeting-error' : undefined
                  }
                  $error={Boolean(errorFor('preferredMeeting'))}
                />
                {errorFor('preferredMeeting') ? (
                  <ErrorText id="preferredMeeting-error">
                    {errorFor('preferredMeeting')}
                  </ErrorText>
                ) : null}
              </Field>

              <Field $full>
                <Label htmlFor="details">
                  Detailed project requirement <span>Required · {values.details.length}/5000</span>
                </Label>
                <Textarea
                  id="details"
                  name="details"
                  placeholder="What are you building, who is it for and what does success look like? Even two or three sentences help. Links to existing work are welcome."
                  value={values.details}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(errorFor('details'))}
                  aria-describedby={errorFor('details') ? 'details-error' : undefined}
                  $error={Boolean(errorFor('details'))}
                />
                {errorFor('details') ? (
                  <ErrorText id="details-error">{errorFor('details')}</ErrorText>
                ) : (
                  <Counter>
                    The more specific you are, the faster we can respond with a
                    useful plan.
                  </Counter>
                )}
              </Field>
            </Grid>

            <Honeypot aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input
                id="website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={values.website}
                onChange={(event) =>
                  setFieldValue('website', event.target.value)
                }
              />
            </Honeypot>

            <SubmitRow>
              <Button
                type="submit"
                size="lg"
                full
                disabled={isSubmitting}
                icon={
                  isSubmitting ? (
                    <Loader2 size={17} strokeWidth={2} />
                  ) : (
                    <Send size={16} strokeWidth={1.9} />
                  )
                }
                arrow={false}
              >
                Send Enquiry
              </Button>
              <SubmitNote>
                <MessageCircle size={15} strokeWidth={1.9} />
                <span>
                  Your enquiry opens in WhatsApp with every field filled in.
                  Press Send inside WhatsApp to deliver it — we do not report it
                  as submitted before then.
                </span>
              </SubmitNote>
              <Legal>
                By sending this enquiry you agree to our{' '}
                <Link href="/privacy-policy">Privacy Policy</Link>. Your details
                are used only to respond to this enquiry.
              </Legal>
            </SubmitRow>
          </FormEl>
        );
      }}
    </Formik>
  );
}
