import { isEmailConfigured } from '@/lib/email/send';

// The deployment origin that builds magic-link callback URLs must never be
// derived from the request Host header in production: with `trustHost` on,
// that header is attacker-controlled and would redirect the emailed link.
// Production therefore requires an explicit AUTH_URL.
const CANONICAL_URL_REQUIRED = process.env.NODE_ENV === 'production';

export function getAuthReadiness() {
  const database = Boolean(process.env.DATABASE_URL);
  const authSecret = Boolean(process.env.AUTH_SECRET);
  // True for a configured Resend account or a local SMTP sink.
  const emailDelivery = isEmailConfigured();
  const bootstrapOwner = Boolean(process.env.WORKSPACE_OWNER_EMAIL);
  const canonicalUrl =
    Boolean(process.env.AUTH_URL) || !CANONICAL_URL_REQUIRED;

  return {
    database,
    authSecret,
    emailDelivery,
    bootstrapOwner,
    canonicalUrl,
    ready: database && authSecret && emailDelivery && canonicalUrl,
  };
}
