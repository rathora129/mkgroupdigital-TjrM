import siteConfig from '@/data/site';

// WhatsApp links start failing and can get truncated by clients well before
// browser URL limits. Anything longer is handed off through the copy/email
// fallback instead of being silently shortened.
export const MAX_WHATSAPP_MESSAGE = 3000;

const text = (value) =>
  value && String(value).trim() ? String(value).trim() : 'Not provided';

export function buildEnquiryMessage(values) {
  const services = Array.isArray(values.services)
    ? values.services.filter(Boolean)
    : [];

  return [
    'NEW WEBSITE ENQUIRY – MK GROUP DIGITAL',
    '',
    `Name: ${text(values.fullName)}`,
    `Company: ${text(values.company)}`,
    `Mobile: ${text(values.mobile)}`,
    `WhatsApp: ${text(values.whatsapp)}`,
    `Email: ${text(values.email)}`,
    `Location: ${text(values.location)}`,
    `Industry: ${text(values.industry)}`,
    `Interested Services: ${services.length ? services.join(', ') : 'Not provided'}`,
    `Project Type: ${text(values.projectType)}`,
    `Existing Website: ${text(values.existingWebsite)}`,
    `Estimated Budget: ${text(values.budget)}`,
    `Expected Timeline: ${text(values.timeline)}`,
    `Preferred Contact: ${text(values.contactMethod)}`,
    `Preferred Meeting: ${text(values.preferredMeeting)}`,
    '',
    'DETAILED REQUIREMENT:',
    text(values.details),
    '',
    'Please contact this client regarding the enquiry.',
  ].join('\n');
}

export function buildShortEnquiryMessage(values) {
  const services = Array.isArray(values.services)
    ? values.services.filter(Boolean)
    : [];

  return [
    'NEW WEBSITE ENQUIRY – MK GROUP DIGITAL',
    '',
    `Name: ${text(values.fullName)}`,
    `Company: ${text(values.company)}`,
    `Mobile: ${text(values.mobile)}`,
    `Interested Services: ${services.length ? services.join(', ') : 'Not provided'}`,
    `Estimated Budget: ${text(values.budget)}`,
    `Preferred Contact: ${text(values.contactMethod)}`,
    '',
    'My detailed requirement is long, so I will share it here in chat.',
  ].join('\n');
}

export function buildWhatsAppUrl(message) {
  return `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export function prepareEnquiry(values) {
  const message = buildEnquiryMessage(values);
  const tooLong = message.length > MAX_WHATSAPP_MESSAGE;

  return {
    message,
    tooLong,
    url: buildWhatsAppUrl(message),
    shortUrl: tooLong
      ? buildWhatsAppUrl(buildShortEnquiryMessage(values))
      : null,
  };
}
