import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_CATEGORY_LABELS,
  KNOWLEDGE_PROVENANCE_META,
  KNOWLEDGE_SOURCE_LABELS,
  KNOWLEDGE_STATUS_META,
  MEMORY_CONFIDENCE_META,
  MEMORY_STATUS_META,
  MEMORY_TYPE_LABELS,
  MEMORY_TYPES,
} from '@/lib/knowledge/constants';

const TONE_ALIAS = { neutral: 'muted', info: 'muted' };

export function fixedTone(value) {
  return TONE_ALIAS[value] || value || 'muted';
}

export function categoryLabel(key) {
  return KNOWLEDGE_CATEGORY_LABELS[key] || 'Other';
}

export function statusMeta(value) {
  const meta = KNOWLEDGE_STATUS_META[value] || { label: value, tone: 'muted' };
  return { label: meta.label, tone: fixedTone(meta.tone) };
}

export function provenanceMeta(value) {
  const meta =
    KNOWLEDGE_PROVENANCE_META[value] || {
      label: value,
      tone: 'muted',
      description: 'Recorded for reference.',
    };
  return {
    label: meta.label,
    tone: fixedTone(meta.tone),
    description: meta.description,
  };
}

export function sourceLabel(value) {
  return KNOWLEDGE_SOURCE_LABELS[value] || value || 'Manual';
}

export function memoryTypeLabel(value) {
  return MEMORY_TYPE_LABELS[value] || value;
}

export function documentStatusMeta(value) {
  if (value === 'processed') return { label: 'Processed', tone: 'success' };
  if (value === 'failed') return { label: 'Failed', tone: 'danger' };
  if (value === 'processing') return { label: 'Processing', tone: 'warning' };
  return { label: value || 'Unknown', tone: 'muted' };
}

export function memoryStatusMeta(value) {
  const meta = MEMORY_STATUS_META[value] || { label: value, tone: 'muted' };
  return { label: meta.label, tone: fixedTone(meta.tone) };
}

export function confidenceMeta(value) {
  const meta = MEMORY_CONFIDENCE_META[value] || {
    label: value,
    tone: 'muted',
  };
  return { label: meta.label, tone: fixedTone(meta.tone) };
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export function tagsFromText(value) {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export const CATEGORY_OPTIONS = KNOWLEDGE_CATEGORIES.map((category) => ({
  key: category.key,
  label: category.label,
  description: category.description,
}));

export const MEMORY_TYPE_OPTIONS = MEMORY_TYPES;
