const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10000;
const DEFAULT_SMTP_PORT = 1025;

function getEmailTransport() {
  const value = (process.env.EMAIL_TRANSPORT || '').trim().toLowerCase();
  return value === 'smtp' ? 'smtp' : 'resend';
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  const port = Number.parseInt(process.env.SMTP_PORT || '', 10);
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_SMTP_PORT,
  };
}

export function getEmailDeliveryStatus() {
  if (getEmailTransport() === 'smtp') {
    return {
      transport: 'smtp',
      configured: Boolean(getSmtpConfig() && process.env.AUTH_EMAIL_FROM),
    };
  }

  return {
    transport: 'resend',
    configured: Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM),
  };
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function isEmailConfigured() {
  return getEmailDeliveryStatus().configured;
}

async function sendViaSmtp({ to, subject, text, html }) {
  const config = getSmtpConfig();

  try {
    // Loaded lazily so the Resend path never pulls nodemailer in.
    const { default: nodemailer } = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });

    await transport.sendMail({
      from: process.env.AUTH_EMAIL_FROM,
      to,
      subject,
      text,
      html,
    });

    return { delivered: true };
  } catch {
    console.error('[email] SMTP delivery failed');
    return { delivered: false, reason: 'network_error' };
  }
}

// Outbound email is an interface, not a hard dependency: Resend's HTTP API is
// the production adapter, SMTP (Mailpit) is the local-development adapter.
// Anything else can be added here without touching callers.
export async function sendEmail({ to, subject, text, html }) {
  const delivery = getEmailDeliveryStatus();
  if (!delivery.configured) {
    return { delivered: false, reason: 'not_configured' };
  }

  if (delivery.transport === 'smtp') {
    return sendViaSmtp({ to, subject, text, html });
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.AUTH_EMAIL_FROM,
        to: [to],
        subject,
        text,
        html,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[email] provider responded ${response.status}`);
      return { delivered: false, reason: 'provider_error' };
    }

    return { delivered: true };
  } catch {
    console.error('[email] delivery request failed');
    return { delivered: false, reason: 'network_error' };
  }
}

export async function sendMagicLinkEmail({ to, url, expires }) {
  const expiresMinutes = Math.max(
    1,
    Math.round((expires.getTime() - Date.now()) / 60000),
  );
  const safeUrl = escapeHtml(url);

  return sendEmail({
    to,
    subject: 'Your MK AI Workforce sign-in link',
    text: [
      'Sign in to MK AI Workforce',
      '',
      `Open this link to continue: ${url}`,
      '',
      `This link expires in ${expiresMinutes} minutes and can only be used once.`,
      'If you did not request it, you can ignore this email.',
    ].join('\n'),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#172033">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748B">MK AI Workforce</p>
  <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#172033">Your sign-in link</h1>
  <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#334155">
    Use the button below to sign in. The link expires in ${expiresMinutes} minutes and can only be used once.
  </p>
  <p style="margin:0 0 24px">
    <a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#4F46E5;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none">
      Sign in to workspace
    </a>
  </p>
  <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#64748B">If the button does not work, copy this link into your browser:</p>
  <p style="margin:0;font-size:12px;line-height:1.6;word-break:break-all;color:#4F46E5">${safeUrl}</p>
  <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #E5EAF1;font-size:12px;line-height:1.6;color:#64748B">
    If you did not request this link, you can ignore this email.
  </p>
</div>`,
  });
}

export async function sendInvitationEmail({ to, role, loginUrl }) {
  const safeUrl = escapeHtml(loginUrl);

  return sendEmail({
    to,
    subject: 'You have been invited to MK AI Workforce',
    text: [
      'You have been invited to MK AI Workforce.',
      '',
      `Role: ${role}`,
      `Sign in with this email address: ${loginUrl}`,
      '',
      'This workspace is invite-only. Sign-in links are sent to this address only.',
    ].join('\n'),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#172033">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748B">MK AI Workforce</p>
  <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#172033">You have been invited</h1>
  <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#334155">
    You now have access to the MK AI Workforce workspace as <strong>${escapeHtml(role)}</strong>.
  </p>
  <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#334155">
    Sign in with this email address to receive a one-time sign-in link.
  </p>
  <p style="margin:0 0 24px">
    <a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#4F46E5;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none">
      Open sign-in page
    </a>
  </p>
  <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #E5EAF1;font-size:12px;line-height:1.6;color:#64748B">
    This workspace is invite-only. If you were not expecting this invitation, you can ignore this email.
  </p>
</div>`,
  });
}
