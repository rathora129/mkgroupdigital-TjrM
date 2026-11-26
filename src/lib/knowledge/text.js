import { createHash } from 'node:crypto';
import { ApiError } from '@/lib/api-error';
import {
  CHUNK_OVERLAP_CHARS,
  CHUNK_TARGET_CHARS,
  DOCUMENT_FORMATS,
  MAX_CHUNKS_PER_DOCUMENT,
} from './constants';

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function normalizeText(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function hashOf(value) {
  return createHash('sha256').update(value).digest('hex');
}

// Hashes ignore case and whitespace so the same knowledge cannot be stored
// twice with cosmetic differences.
export function contentHash(text) {
  const normalized = normalizeText(text)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return hashOf(normalized);
}

export function checksumOf(buffer) {
  return hashOf(buffer);
}

export function estimateTokens(charCount) {
  return Math.max(1, Math.ceil(Number(charCount || 0) / 4));
}

export function sanitizeFilename(rawName) {
  const withoutPath = String(rawName || '')
    .split(/[\\/]/)
    .pop()
    .replace(CONTROL_CHARS, '')
    .trim();
  const cleaned = withoutPath.replace(/^\.+/, '').slice(0, 200);
  return cleaned || 'document.txt';
}

export function detectDocumentFormat(filename) {
  const lower = String(filename || '').toLowerCase();
  return (
    DOCUMENT_FORMATS.find((entry) =>
      entry.extensions.some((extension) => lower.endsWith(extension)),
    ) || null
  );
}

// Binary payloads are rejected explicitly. There is no PDF or DOCX extractor
// in this project, so those formats are reported as unsupported instead of
// being stored as if they had been indexed.
export function decodeDocumentText(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new ApiError(422, 'EMPTY_DOCUMENT', 'That file is empty.');
  }
  if (buffer.includes(0)) {
    throw new ApiError(
      422,
      'UNSUPPORTED_FORMAT',
      'That file appears to be binary. Only plain-text formats can be processed.',
    );
  }

  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new ApiError(
      422,
      'UNSUPPORTED_ENCODING',
      'That file is not valid UTF-8 text and cannot be processed safely.',
    );
  }

  const normalized = normalizeText(text);
  if (!normalized) {
    throw new ApiError(
      422,
      'EMPTY_DOCUMENT',
      'No readable text was found in that file.',
    );
  }
  return normalized;
}

const SECRET_PATTERNS = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, reason: 'a private key block' },
  {
    re: /\b(password|passwd|pwd)\s*[:=]\s*\S+/i,
    reason: 'a password value',
  },
  {
    re: /\b(api[_-]?key|secret[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|refresh[_-]?token)\s*[:=]\s*\S+/i,
    reason: 'an API key or token value',
  },
  { re: /\bsk-[A-Za-z0-9_-]{16,}/, reason: 'an API key' },
  { re: /\bghp_[A-Za-z0-9]{20,}/, reason: 'an access token' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, reason: 'an access key' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, reason: 'an access token' },
  {
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
    reason: 'a signed token',
  },
];

// Secrets must never be persisted in knowledge or memory. The check is
// deliberately conservative: a false positive is easier to correct than a
// leaked credential.
export function findSecret(text) {
  const value = String(text || '');
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.re.test(value)) return pattern.reason;
  }
  return null;
}

export function redactSecrets(text) {
  let value = String(text || '');
  for (const pattern of SECRET_PATTERNS) {
    value = value.replace(pattern.re, '[redacted]');
  }
  return value;
}

function splitLongBlock(block, target) {
  const pieces = [];
  let remaining = block;
  while (remaining.length > target) {
    let cut = remaining.lastIndexOf('. ', target);
    if (cut < target * 0.5) cut = remaining.lastIndexOf(' ', target);
    if (cut < target * 0.5) cut = target;
    pieces.push(remaining.slice(0, cut + 1).trim());
    remaining = remaining.slice(cut + 1).trim();
  }
  if (remaining) pieces.push(remaining);
  return pieces;
}

// Chunks are sized for retrieval, keep their original wording and retain the
// nearest markdown heading so a source reference is meaningful.
export function chunkText(text, options = {}) {
  const target = options.targetChars || CHUNK_TARGET_CHARS;
  const overlap = options.overlapChars ?? CHUNK_OVERLAP_CHARS;
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const chunks = [];
  let heading = null;
  let buffer = '';

  const push = (content, chunkHeading) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    chunks.push({ content: trimmed, heading: chunkHeading });
  };

  const flush = () => {
    if (buffer.trim()) push(buffer, heading);
    buffer = '';
  };

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (!block) continue;
    if (/^#{1,6}\s+/.test(block)) {
      flush();
      heading = block.replace(/^#{1,6}\s+/, '').trim().slice(0, 160);
      buffer = block;
      continue;
    }

    if (block.length > target) {
      flush();
      for (const piece of splitLongBlock(block, target)) push(piece, heading);
      continue;
    }

    if (buffer.length + block.length + 2 > target) flush();
    buffer = buffer ? `${buffer}\n\n${block}` : block;
  }
  flush();

  return chunks.slice(0, MAX_CHUNKS_PER_DOCUMENT).map((chunk, index) => {
    let content = chunk.content;
    if (index > 0 && overlap > 0) {
      const previous = chunks[index - 1]?.content || '';
      const tail = previous.slice(-overlap).trim();
      if (tail && !content.startsWith(tail)) {
        content = `${tail} ${content}`;
      }
    }
    return {
      index,
      heading: chunk.heading || null,
      content,
      charCount: content.length,
      tokenEstimate: estimateTokens(content.length),
    };
  });
}

export function clipText(text, maxChars) {
  const value = String(text || '');
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}
