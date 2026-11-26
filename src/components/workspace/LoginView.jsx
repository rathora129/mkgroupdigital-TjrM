'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import styled from 'styled-components';
import { logoutAction } from '@/app/workspace/actions';

const Card = styled.div`
  width: 100%;
  max-width: 440px;
  padding: clamp(24px, 4vw, 34px);
  border-radius: ${({ theme }) => theme.radius.xl};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bg};
  box-shadow: ${({ theme }) => theme.shadow.raised};
`;

const BrandRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 22px;
`;

const BrandMark = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  border: 1px solid ${({ theme }) => theme.colors.primaryBorder};
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
`;

const BrandCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
`;

const BrandName = styled.p`
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: ${({ theme }) => theme.colors.text};
`;

const BrandSub = styled.p`
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const Title = styled.h1`
  font-size: clamp(1.4rem, 3.4vw, 1.7rem);
  letter-spacing: -0.025em;
  margin-bottom: 8px;
`;

const Lead = styled.p`
  font-size: 0.86rem;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 20px;
`;

const Notice = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  margin-bottom: 18px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid
    ${({ theme, $tone }) =>
      $tone === 'danger' ? theme.colors.danger : theme.colors.warning};
  background: ${({ theme, $tone }) =>
    $tone === 'danger' ? theme.colors.dangerSoft : theme.colors.warningSoft};
  color: ${({ theme, $tone }) =>
    $tone === 'danger' ? theme.colors.danger : theme.colors.warning};
  font-size: 0.78rem;
  line-height: 1.55;

  strong {
    font-weight: 700;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 2px;
    padding-left: 16px;
    list-style: disc;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
`;

const Label = styled.label`
  font-size: 0.78rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSoft};
`;

const Input = styled.input`
  min-height: 44px;
  padding: 0 13px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.bg};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.88rem;

  &::placeholder {
    color: ${({ theme }) => theme.colors.faint};
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const Submit = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  font-size: 0.86rem;
  font-weight: 600;
  transition: background-color 0.2s ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primaryHover};
  }

  &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
`;

const SecondaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  background: ${({ theme }) => theme.colors.bg};
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 0.8rem;
  font-weight: 600;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primaryBorder};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const Sent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.success};
  background: ${({ theme }) => theme.colors.successSoft};

  p {
    font-size: 0.82rem;
    line-height: 1.6;
    color: ${({ theme }) => theme.colors.textSoft};
  }

  strong {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.84rem;
    color: ${({ theme }) => theme.colors.success};
  }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};

  a {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.76rem;
    color: ${({ theme }) => theme.colors.muted};

    &:hover {
      color: ${({ theme }) => theme.colors.primary};
    }
  }

  span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.7rem;
    color: ${({ theme }) => theme.colors.faint};
  }
`;

const ERROR_MESSAGES = {
  AccessDenied: 'That email address is not invited to this workspace.',
  Verification:
    'That sign-in link has expired or has already been used. Request a new one.',
  Configuration: 'Sign-in is not fully configured yet.',
  EmailSignInError:
    'We could not send a sign-in link right now. Please try again shortly.',
};

function missingSetup(readiness) {
  const items = [];
  if (!readiness.database) items.push('Database connection');
  if (!readiness.authSecret) items.push('Session signing secret');
  if (!readiness.emailDelivery) items.push('Email delivery');
  if (!readiness.canonicalUrl) items.push('Canonical sign-in URL (AUTH_URL)');
  return items;
}

export default function LoginView({
  initialEmail = '',
  errorCode = null,
  readiness,
  signedInEmail = null,
}) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState('idle');
  const missing = missingSetup(readiness);
  const errorMessage = errorCode
    ? ERROR_MESSAGES[errorCode] || 'Sign-in could not be completed. Please try again.'
    : null;

  async function onSubmit(event) {
    event.preventDefault();
    if (status !== 'idle' || !readiness.ready) return;

    const address = email.trim().toLowerCase();
    if (!address) return;

    setStatus('submitting');
    try {
      await signIn('email', {
        email: address,
        redirect: false,
        callbackUrl: '/workspace',
      });
    } catch {
      // The response is intentionally identical for every address so the
      // form cannot be used to discover who has access.
    }
    setStatus('sent');
  }

  return (
    <Card>
      <BrandRow>
        <BrandMark>
          <Sparkles size={18} strokeWidth={1.9} aria-hidden="true" />
        </BrandMark>
        <BrandCopy>
          <BrandName>MK AI Workforce</BrandName>
          <BrandSub>MK Group Digital</BrandSub>
        </BrandCopy>
      </BrandRow>

      {signedInEmail ? (
        <>
          <Title>This account has no workspace access</Title>
          <Lead>
            You are signed in as <strong>{signedInEmail}</strong>, but this
            account is not a member of the workspace. Ask the workspace owner
            for an invitation, or sign out and use another address.
          </Lead>
          <form action={logoutAction}>
            <SecondaryButton type="submit">Sign out</SecondaryButton>
          </form>
        </>
      ) : (
        <>
          <Title>Sign in to your workspace</Title>
          <Lead>
            MK AI Workforce is invite-only. Enter the email address your
            invitation was sent to and we will send a one-time sign-in link.
          </Lead>

          {errorMessage ? (
            <Notice $tone="danger" role="alert">
              {errorMessage}
            </Notice>
          ) : null}

          {missing.length > 0 ? (
            <Notice $tone="warning" role="status">
              <strong>Sign-in is not fully configured yet.</strong>
              <span>An operator needs to finish setup for this environment:</span>
              <ul>
                {missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Notice>
          ) : null}

          {status === 'sent' ? (
            <Sent role="status" aria-live="polite">
              <strong>
                <CheckCircle2 size={16} aria-hidden="true" /> Check your inbox
              </strong>
              <p>
                If <strong>{email.trim().toLowerCase()}</strong> has access, a
                one-time sign-in link is on its way. The link expires in 30
                minutes and can be used once.
              </p>
              <SecondaryButton type="button" onClick={() => setStatus('idle')}>
                <Mail size={15} aria-hidden="true" /> Use a different email
              </SecondaryButton>
            </Sent>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              <Field>
                <Label htmlFor="signin-email">Work email</Label>
                <Input
                  id="signin-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={status === 'submitting'}
                  required
                />
              </Field>
              <Submit
                type="submit"
                disabled={!readiness.ready || status === 'submitting'}
              >
                {status === 'submitting' ? (
                  <>
                    <Loader2 size={16} className="spin" aria-hidden="true" />
                    Sending link…
                  </>
                ) : (
                  'Email me a sign-in link'
                )}
              </Submit>
            </form>
          )}
        </>
      )}

      <Footer>
        <Link href="/">
          <ArrowLeft size={14} aria-hidden="true" /> Back to public website
        </Link>
        <span>
          <ShieldCheck size={13} aria-hidden="true" /> Invite-only access
        </span>
      </Footer>
    </Card>
  );
}
