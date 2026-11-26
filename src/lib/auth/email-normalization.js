export const MAX_EMAIL_LENGTH = 254;

// Canonical form shared by the magic-link provider, the sign-in callback and
// invitation validation. NFKC runs first so lookalike characters that expand
// to "@" are folded before the single-@ check instead of splitting an address
// later in a mail parser. Quoted local parts and comma-separated lists are
// rejected rather than rewritten, because both let one identifier match more
// than one recipient.
export function normalizeEmailIdentifier(identifier) {
  if (typeof identifier !== 'string') return null;

  const normalized = identifier.normalize('NFKC').trim().toLowerCase();

  if (!normalized || normalized.length > MAX_EMAIL_LENGTH) return null;
  if (normalized.includes('"') || normalized.includes(',')) return null;
  if (/\s/.test(normalized)) return null;
  if (/\p{Cc}/u.test(normalized)) return null;

  const parts = normalized.split('@');
  if (parts.length !== 2) return null;

  const [local, domain] = parts;
  if (!local || !domain) return null;

  return normalized;
}
