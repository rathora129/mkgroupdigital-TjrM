import { isEmailConfigured, sendMagicLinkEmail } from '@/lib/email/send';
import { normalizeEmailIdentifier } from '@/lib/auth/email-normalization';

export const MAGIC_LINK_MAX_AGE_SECONDS = 30 * 60;

// Auth.js email provider without an SMTP/nodemailer dependency. The provider
// contract only needs `sendVerificationRequest`; delivery is delegated to the
// mail interface so the transport can change without touching auth.
export function createEmailProvider() {
  return {
    id: 'email',
    type: 'email',
    name: 'Email',
    maxAge: MAGIC_LINK_MAX_AGE_SECONDS,
    server: {},
    options: {},
    // Auth.js treats a throw here as "invalid email" and aborts the request;
    // replacing its default normalizer is only safe while the checks it made
    // are preserved.
    normalizeIdentifier(identifier) {
      const normalized = normalizeEmailIdentifier(identifier);
      if (!normalized) {
        throw new Error('Invalid email address format.');
      }
      return normalized;
    },
    async sendVerificationRequest({ identifier, url, expires }) {
      const result = await sendMagicLinkEmail({
        to: identifier,
        url,
        expires,
      });

      if (result.delivered) return;

      if (!isEmailConfigured()) {
        // Never log the token or URL. The operator sees the configuration
        // warning on the sign-in page instead.
        console.error('[auth] magic link requested but email delivery is not configured');
        throw new Error('Email delivery is not configured');
      }

      throw new Error('Email delivery failed');
    },
  };
}
