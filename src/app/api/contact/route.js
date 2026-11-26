import { NextResponse } from 'next/server';
import siteConfig from '@/data/site';
import { contactSchema } from '@/lib/contactSchema';

const FALLBACK_MESSAGE = `Online message delivery is not available right now. Please email ${siteConfig.email} or message us on WhatsApp at ${siteConfig.phone}.`;

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function leadRows(data) {
  const services = Array.isArray(data.services) ? data.services : [];
  return [
    ['Name', data.fullName],
    ['Company', data.company || 'Not provided'],
    ['Mobile', data.mobile],
    ['WhatsApp', data.whatsapp || 'Not provided'],
    ['Email', data.email || 'Not provided'],
    ['Location', data.location || 'Not provided'],
    ['Industry', data.industry || 'Not provided'],
    ['Interested services', services.length ? services.join(', ') : 'Not provided'],
    ['Project type', data.projectType || 'Not provided'],
    ['Existing website', data.existingWebsite || 'Not provided'],
    ['Estimated budget', data.budget || 'Not provided'],
    ['Expected timeline', data.timeline || 'Not provided'],
    ['Preferred contact', data.contactMethod],
    ['Preferred meeting', data.preferredMeeting || 'Not provided'],
    ['Project details', data.details],
  ];
}

function leadText(data) {
  return leadRows(data)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}

function leadHtml(data) {
  const rows = leadRows(data)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#666;vertical-align:top">${escapeHtml(
          label,
        )}</td><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(
          value,
        )}</td></tr>`,
    )
    .join('');

  return `<h2 style="font-family:Arial,sans-serif">New project enquiry</h2><table style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${rows}</table>`;
}

async function sendViaResend(data) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM_EMAIL,
      to: [process.env.CONTACT_TO_EMAIL || siteConfig.email],
      reply_to: data.email || undefined,
      subject: `New enquiry — ${(data.services || []).join(', ') || 'Project'} · ${
        data.company || data.fullName
      }`,
      text: leadText(data),
      html: leadHtml(data),
    }),
    signal: AbortSignal.timeout(10000),
  });

  return response.ok;
}

async function sendViaWebhook(data) {
  const response = await fetch(process.env.CONTACT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'contact-enquiry',
      submittedAt: new Date().toISOString(),
      data,
    }),
    signal: AbortSignal.timeout(10000),
  });

  return response.ok;
}

export async function POST(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 50_000) {
    return NextResponse.json(
      { ok: false, message: 'That message is too large to send.' },
      { status: 413 },
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: 'We could not read that submission. Please try again.' },
      { status: 400 },
    );
  }

  if (payload?.website) {
    return NextResponse.json(
      { ok: false, message: 'That submission was rejected. Please try again.' },
      { status: 400 },
    );
  }

  let data;
  try {
    data = await contactSchema.validate(payload, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch (error) {
    const errors = {};
    for (const issue of error.inner || []) {
      if (issue.path && !errors[issue.path]) {
        errors[issue.path] = issue.message;
      }
    }
    return NextResponse.json(
      {
        ok: false,
        message: 'Please check the highlighted fields and try again.',
        errors,
      },
      { status: 422 },
    );
  }

  const resendConfigured = Boolean(
    process.env.RESEND_API_KEY && process.env.CONTACT_FROM_EMAIL,
  );
  const webhookConfigured = Boolean(process.env.CONTACT_WEBHOOK_URL);

  if (!resendConfigured && !webhookConfigured) {
    return NextResponse.json(
      { ok: false, code: 'NOT_CONFIGURED', message: FALLBACK_MESSAGE },
      { status: 503 },
    );
  }

  try {
    const delivered = resendConfigured
      ? await sendViaResend(data)
      : await sendViaWebhook(data);

    if (!delivered) {
      return NextResponse.json(
        { ok: false, code: 'DELIVERY_FAILED', message: FALLBACK_MESSAGE },
        { status: 502 },
      );
    }
  } catch {
    return NextResponse.json(
      { ok: false, code: 'DELIVERY_FAILED', message: FALLBACK_MESSAGE },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    message:
      'Thanks — your enquiry has been received. We reply within one business day.',
  });
}
