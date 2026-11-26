import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '@/db/client';
import {
  leadActivities,
  leadImportBatches,
  leadImportRows,
  leadStatusHistory,
  leads,
} from '@/db/schema';
import { ApiError } from '@/lib/api-error';
import { recordAudit } from '@/lib/audit';
import {
  findPossibleDuplicates,
  normalizeCompanyKey,
  websiteHost,
} from './service';
import { IMPORT_FIELDS, IMPORT_FIELD_LABELS } from './import-fields';

export { IMPORT_FIELDS, IMPORT_FIELD_LABELS };

// Owner spreadsheet columns are only an INPUT FORMAT. They are mapped into the
// native lead model and the original row is kept with the batch, so the lead
// schema is never reshaped around a spreadsheet.

export const IMPORT_MAX_CHARS = 400_000;
export const IMPORT_MAX_ROWS = 2_000;

const ALIASES = {
  companyName: ['companyname', 'company', 'businessname', 'business', 'firmname', 'clientname', 'organisation', 'organization', 'nameofcompany'],
  phone: ['contactnumber', 'phone', 'phonenumber', 'mobile', 'mobilenumber', 'contactno', 'number', 'whatsapp', 'whatsappnumber'],
  contactName: ['ownercontactperson', 'owner', 'contactperson', 'contactname', 'ownername', 'person', 'poc', 'contact'],
  requirementsInitial: ['initialrequirement', 'initialrequirements', 'requirement', 'requirements', 'need', 'initialneed'],
  website: ['website', 'weburl', 'url', 'site', 'websiteurl'],
  callDate: ['calldate', 'dateofcall', 'lastcalldate'],
  callStatus: ['callstatus', 'statusofcall', 'callresult'],
  requirementsDetailed: ['detailedclientrequirement', 'detailedrequirement', 'requirementsdetailed', 'detailedrequirements', 'clientrequirement', 'requirementdetails', 'detailedneed'],
  nextMeetingDate: ['nextmeetingdate', 'meetingdate', 'nextmeeting', 'meetingon'],
  nextMeetingTime: ['nextmeetingtime', 'meetingtime', 'meetingat'],
  dateAdded: ['dateadded', 'addeddate', 'createddate', 'entrydate'],
  amountReceived: ['amountreceived', 'received', 'amountpaid', 'paid', 'paymentreceived'],
  outstanding: ['outstanding', 'outstandingamount', 'balance', 'balanceamount', 'pendingamount'],
  projectCost: ['projectcost', 'cost', 'totalcost', 'projectvalue', 'value'],
  followUp: ['followup', 'followupdate', 'nextfollowup', 'followupnotes', 'followupremark', 'remark'],
};

export function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function aliasScore(headerKey, alias) {
  if (!headerKey || !alias) return 0;
  if (headerKey === alias) return 100;
  if (headerKey.startsWith(alias) || alias.startsWith(headerKey)) {
    return 60 + Math.min(headerKey.length, alias.length);
  }
  if (headerKey.includes(alias) || alias.includes(headerKey)) {
    return 30 + Math.min(headerKey.length, alias.length);
  }
  return 0;
}

export function mapHeaders(headers) {
  const mapping = {};
  const used = new Set();
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    let best = null;
    let bestScore = 0;
    for (const field of IMPORT_FIELDS) {
      if (used.has(field)) continue;
      for (const alias of ALIASES[field]) {
        const score = aliasScore(key, alias);
        if (score > bestScore) {
          best = field;
          bestScore = score;
        }
      }
    }
    if (best && bestScore >= 30) {
      mapping[best] = index;
      used.add(best);
    }
  });
  return mapping;
}

function detectFormat(text) {
  const trimmed = text.replace(/\r\n/g, '\n').trim();
  const lines = trimmed.split('\n').filter((line) => line.trim() !== '');
  if (lines.length >= 2) {
    const first = lines[0].trim();
    const second = lines[1].trim();
    if (
      first.startsWith('|') &&
      /^\|?[\s:-]+\|[\s|:-]*$/.test(second)
    ) {
      return 'markdown';
    }
  }
  if (lines[0]?.includes('\t')) return 'tsv';
  if (lines.some((line) => line.includes('\t'))) return 'tsv';
  return 'csv';
}

// RFC4180-style parser: quoted values may contain the delimiter and newlines.
export function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => String(cell).trim() !== ''));
}

export function parseMarkdownTable(text) {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.trim().startsWith('|'));
  if (lines.length === 0) return [];
  const rows = [];
  for (const line of lines) {
    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    rows.push(cells);
  }
  return rows;
}

function looksLikeHeader(row) {
  const mapping = mapHeaders(row);
  return Object.keys(mapping).length >= 3;
}

export function parseLeadImportText(text, { mapping = null } = {}) {
  const cleaned = String(text || '');
  if (cleaned.trim() === '') {
    throw new ApiError(422, 'EMPTY_IMPORT', 'Paste spreadsheet rows before importing.');
  }
  if (cleaned.length > IMPORT_MAX_CHARS) {
    throw new ApiError(413, 'IMPORT_TOO_LARGE', 'That import is too large. Split it into smaller batches.');
  }

  const format = detectFormat(cleaned);
  let matrix;
  if (format === 'markdown') {
    matrix = parseMarkdownTable(cleaned);
  } else {
    matrix = parseDelimited(cleaned, format === 'tsv' ? '\t' : ',');
  }

  if (matrix.length === 0) {
    throw new ApiError(422, 'EMPTY_IMPORT', 'No spreadsheet rows could be read.');
  }
  if (matrix.length > IMPORT_MAX_ROWS + 1) {
    throw new ApiError(422, 'IMPORT_TOO_MANY_ROWS', `Import at most ${IMPORT_MAX_ROWS} rows at a time.`);
  }

  let headers;
  let dataRows;
  if (format === 'markdown' || looksLikeHeader(matrix[0])) {
    headers = matrix[0].map((cell) => String(cell).trim());
    dataRows = matrix.slice(1);
  } else {
    headers = IMPORT_FIELDS.map((field) => IMPORT_FIELD_LABELS[field]);
    dataRows = matrix;
  }

  const resolvedMapping = mapping && Object.keys(mapping).length > 0
    ? { ...mapping }
    : mapHeaders(headers);

  if (!resolvedMapping.companyName && resolvedMapping.companyName !== 0) {
    throw new ApiError(
      422,
      'COMPANY_COLUMN_MISSING',
      'Map a column to Company Name before importing.',
      { mapping: 'Choose which column holds the company name.' },
    );
  }

  const rows = dataRows.map((cells, index) => {
    const raw = {};
    for (const field of IMPORT_FIELDS) {
      const columnIndex = resolvedMapping[field];
      raw[field] = columnIndex === undefined
        ? ''
        : String(cells[columnIndex] ?? '').trim();
    }
    return { rowNumber: index + 2, raw };
  });

  return { format, headers, mapping: resolvedMapping, rows };
}

// ---- value normalisation ---------------------------------------------------

export function phoneDigits(value) {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normalizePhone(value) {
  if (value === null || value === undefined) return { value: null };
  const raw = String(value).trim();
  if (raw === '') return { value: null };
  const cleaned = raw.replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return { error: 'Enter a valid phone number.' };
  }
  return { value: cleaned };
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function buildDate(y, m, d) {
  if (!y || !m || !d) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

// Accepts ISO, DD/MM/YYYY (the owner's local convention), DD-MM-YYYY,
// YYYY-MM-DD, "12 Jan 2026", "Jan 12 2026" and Excel serial numbers.
export function parseFlexibleDate(value) {
  if (value === null || value === undefined) return { value: null };
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? { error: 'Enter a valid date.' } : { value };
  }
  const raw = String(value).trim();
  if (raw === '' || raw === '-' || raw.toLowerCase() === 'n/a') {
    return { value: null };
  }

  if (/^\d{5}$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20000 && serial < 60000) {
      return { value: new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000) };
    }
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const date = buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return date ? { value: date } : { error: 'Enter a valid date.' };
  }

  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    let day = Number(dmy[1]);
    let month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    // Owner sheets are DD/MM/YYYY. Only reinterpret as M/D/Y when the second
    // value cannot be a month but the first can.
    if (day > 12 && month > 12) return { error: 'Enter a valid date.' };
    if (day <= 12 && month > 12) {
      const tmp = day;
      day = month;
      month = tmp;
    }
    const date = buildDate(year, month, day);
    return date ? { value: date } : { error: 'Enter a valid date.' };
  }

  const named = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})$/);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    let year = Number(named[3]);
    if (year < 100) year += 2000;
    const date = buildDate(year, month, Number(named[1]));
    return date ? { value: date } : { error: 'Enter a valid date.' };
  }

  const namedUs = raw.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (namedUs) {
    const month = MONTHS[namedUs[1].slice(0, 3).toLowerCase()];
    let year = Number(namedUs[3]);
    if (year < 100) year += 2000;
    const date = buildDate(year, month, Number(namedUs[2]));
    return date ? { value: date } : { error: 'Enter a valid date.' };
  }

  return { error: 'Enter a valid date.' };
}

export function parseFlexibleTime(value) {
  if (value === null || value === undefined) return { value: null };
  const raw = String(value).trim();
  if (raw === '') return { value: null };
  const match = raw.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/i) ||
    raw.match(/^(\d{1,2})\s*(am|pm)$/i);
  if (!match) {
    if (/^\d{3,4}$/.test(raw)) {
      const padded = raw.padStart(4, '0');
      const hours = Number(padded.slice(0, 2));
      const minutes = Number(padded.slice(2));
      if (hours <= 23 && minutes <= 59) {
        return { value: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` };
      }
    }
    return { error: 'Use a time like 14:30.' };
  }
  let hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return { error: 'Use a time like 14:30.' };
  return { value: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` };
}

// Money is stored in integer cents. Values are treated as whole rupees when a
// plain integer is supplied, and decimals are preserved to two places.
export function parseMoney(value) {
  if (value === null || value === undefined) return { value: null };
  const raw = String(value).trim();
  if (raw === '' || raw === '-' || raw === '—') return { value: null };
  const negative = /^\(.*\)$/.test(raw) || raw.startsWith('-');
  const cleaned = raw
    .replace(/[₹$,\s]/g, '')
    .replace(/[()]/g, '')
    .replace(/^-/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { error: 'Enter a valid amount.' };
  }
  const cents = Math.round(Number(cleaned) * 100);
  if (negative) return { error: 'Amount cannot be negative.' };
  if (cents > 100_000_000_000_00) return { error: 'That amount is too large.' };
  return { value: cents };
}

export function normalizeImportRow(raw) {
  const errors = {};
  const warnings = [];
  const normalized = {};

  const companyName = String(raw.companyName || '').trim();
  if (!companyName) errors.companyName = 'Company name is required.';
  else if (companyName.length > 160) errors.companyName = 'Company name must be 160 characters or fewer.';
  normalized.companyName = companyName || null;

  const phone = normalizePhone(raw.phone);
  if (phone.error) errors.phone = phone.error;
  normalized.phone = phone.value ?? null;

  normalized.contactName = String(raw.contactName || '').trim().slice(0, 160) || null;
  normalized.requirementsInitial = String(raw.requirementsInitial || '').trim().slice(0, 5_000) || null;
  normalized.requirementsDetailed = String(raw.requirementsDetailed || '').trim().slice(0, 10_000) || null;

  const website = String(raw.website || '').trim();
  if (website) {
    if (
      !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(website) ||
      website.length > 300
    ) {
      errors.website = 'Enter a valid website address.';
    }
  }
  normalized.website = website || null;

  const callDate = parseFlexibleDate(raw.callDate);
  if (callDate.error) errors.callDate = callDate.error;
  normalized.callDate = callDate.value ?? null;

  normalized.callStatus = String(raw.callStatus || '').trim().slice(0, 500) || null;

  const nextMeetingDate = parseFlexibleDate(raw.nextMeetingDate);
  if (nextMeetingDate.error) errors.nextMeetingDate = nextMeetingDate.error;
  normalized.nextMeetingDate = nextMeetingDate.value ?? null;

  const nextMeetingTime = parseFlexibleTime(raw.nextMeetingTime);
  if (nextMeetingTime.error) errors.nextMeetingTime = nextMeetingTime.error;
  normalized.nextMeetingTime = nextMeetingTime.value ?? null;

  const dateAdded = parseFlexibleDate(raw.dateAdded);
  if (dateAdded.error) errors.dateAdded = dateAdded.error;
  normalized.dateAdded = dateAdded.value ?? null;

  for (const [field, target] of [
    ['amountReceived', 'reportedAmountReceivedCents'],
    ['outstanding', 'reportedOutstandingCents'],
    ['projectCost', 'reportedProjectCostCents'],
  ]) {
    const money = parseMoney(raw[field]);
    if (money.error) errors[field] = money.error;
    normalized[target] = money.value ?? null;
  }

  const followUpRaw = String(raw.followUp || '').trim();
  const followUpDate = parseFlexibleDate(followUpRaw);
  if (followUpDate.error && followUpRaw) {
    normalized.followUpDate = null;
    normalized.followUpNote = followUpRaw.slice(0, 500);
  } else {
    normalized.followUpDate = followUpDate.value ?? null;
    normalized.followUpNote = null;
  }

  if (normalized.nextMeetingTime && !normalized.nextMeetingDate) {
    warnings.push('A meeting time was provided without a meeting date.');
  }

  return { normalized, errors, warnings };
}

export function importSignature(rows) {
  const payload = rows
    .map((row) => [row.rowNumber, row.normalized])
    .sort((left, right) => left[0] - right[0]);
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function importDedupeKey(normalized) {
  const phone = phoneDigits(normalized.phone);
  if (phone) return `phone:${phone}`;
  const host = websiteHost(normalized.website);
  if (host) return `site:${host}`;
  const company = normalizeCompanyKey(normalized.companyName);
  if (company) return `company:${company}`;
  return null;
}

async function detectDuplicate(workspaceId, normalized, seenKeys) {
  const reasons = [];
  let duplicateLeadId = null;

  const matches = await findPossibleDuplicates(workspaceId, {
    companyName: normalized.companyName,
    website: normalized.website,
  });
  if (matches.length > 0) {
    duplicateLeadId = matches[0].id;
    reasons.push(...matches[0].reasons);
  }

  const phone = phoneDigits(normalized.phone);
  if (phone) {
    const rows = await getDb()
      .select({ id: leads.id, phone: leads.phone })
      .from(leads)
      .where(
        and(
          eq(leads.workspaceId, workspaceId),
          sql`regexp_replace(coalesce(${leads.phone}, ''), '[^0-9]', '', 'g') like ${`%${phone}`}`,
        ),
      )
      .limit(5);
    for (const row of rows) {
      if (phoneDigits(row.phone) === phone) {
        duplicateLeadId = duplicateLeadId || row.id;
        if (!reasons.includes('phone')) reasons.push('phone');
        break;
      }
    }
  }

  const key = importDedupeKey(normalized);
  if (key && seenKeys.has(key)) {
    reasons.push('batch');
    duplicateLeadId = duplicateLeadId || seenKeys.get(key);
  } else if (key) {
    seenKeys.set(key, duplicateLeadId);
  }

  return { duplicateLeadId, reasons: [...new Set(reasons)] };
}

async function runAtomic(build) {
  const db = getDb();
  if (getDbDriver() === 'node-postgres') return db.transaction(build);
  return build(db);
}

function assertPreview(batch) {
  if (!batch) {
    throw new ApiError(404, 'IMPORT_NOT_FOUND', 'That import batch could not be found.');
  }
  if (batch.status !== 'preview') {
    throw new ApiError(409, 'IMPORT_LOCKED', 'This import batch has already been committed or cancelled.');
  }
}

async function loadBatch(workspaceId, batchId) {
  const rows = await getDb()
    .select()
    .from(leadImportBatches)
    .where(
      and(
        eq(leadImportBatches.workspaceId, workspaceId),
        eq(leadImportBatches.id, batchId),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

async function loadBatchRows(batchId) {
  return getDb()
    .select()
    .from(leadImportRows)
    .where(eq(leadImportRows.batchId, batchId))
    .orderBy(leadImportRows.rowNumber);
}

function summarize(rows) {
  const totals = { rows: rows.length, valid: 0, invalid: 0, duplicates: 0 };
  for (const row of rows) {
    if (row.status === 'valid') totals.valid += 1;
    else if (row.status === 'duplicate') totals.duplicates += 1;
    else totals.invalid += 1;
  }
  return totals;
}

export async function createImportBatch({
  workspaceId,
  userId,
  text,
  source = 'paste',
  fileName = null,
  mapping = null,
}) {
  const parsed = parseLeadImportText(text, { mapping });
  const seenKeys = new Map();
  const evaluated = [];

  for (const row of parsed.rows) {
    const { normalized, errors, warnings } = normalizeImportRow(row.raw);
    let status = 'valid';
    let duplicateLeadId = null;
    if (Object.keys(errors).length > 0) {
      status = 'invalid';
    } else {
      const duplicate = await detectDuplicate(workspaceId, normalized, seenKeys);
      duplicateLeadId = duplicate.duplicateLeadId;
      if (duplicate.reasons.length > 0) {
        status = 'duplicate';
        warnings.push(`Possible duplicate: ${duplicate.reasons.join(', ')}.`);
      }
    }
    evaluated.push({
      rowNumber: row.rowNumber,
      raw: row.raw,
      normalized,
      errors,
      warnings,
      status,
      duplicateLeadId,
    });
  }

  const signature = importSignature(evaluated);
  const totals = summarize(evaluated);

  const batch = await runAtomic(async (executor) => {
    const inserted = await executor
      .insert(leadImportBatches)
      .values({
        workspaceId,
        source,
        status: 'preview',
        fileName,
        headers: parsed.headers,
        mapping: parsed.mapping,
        totals,
        signature,
        importedByUserId: userId,
      })
      .returning();
    const batchRow = inserted[0];

    await executor.insert(leadImportRows).values(
      evaluated.map((row) => ({
        workspaceId,
        batchId: batchRow.id,
        rowNumber: row.rowNumber,
        raw: row.raw,
        normalized: row.normalized,
        status: row.status,
        errors: row.errors,
        warnings: row.warnings,
        duplicateLeadId: row.duplicateLeadId,
      })),
    );
    return batchRow;
  });

  const committedSame = await getDb()
    .select({ id: leadImportBatches.id })
    .from(leadImportBatches)
    .where(
      and(
        eq(leadImportBatches.workspaceId, workspaceId),
        eq(leadImportBatches.signature, signature),
        eq(leadImportBatches.status, 'committed'),
      ),
    )
    .limit(1);

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'lead.import_preview',
    resourceType: 'lead_import_batch',
    resourceId: batch.id,
    metadata: { totals, format: parsed.format, source },
  });

  const detail = await getImportBatch(workspaceId, batch.id);
  return {
    ...detail,
    format: parsed.format,
    repeatedImport: Boolean(committedSame[0]),
    previousBatchId: committedSame[0]?.id || null,
  };
}

export async function listImportBatches(workspaceId, { limit = 25 } = {}) {
  const rows = await getDb()
    .select({
      id: leadImportBatches.id,
      source: leadImportBatches.source,
      status: leadImportBatches.status,
      fileName: leadImportBatches.fileName,
      totals: leadImportBatches.totals,
      createdAt: leadImportBatches.createdAt,
      committedAt: leadImportBatches.committedAt,
      importedByUserId: leadImportBatches.importedByUserId,
    })
    .from(leadImportBatches)
    .where(eq(leadImportBatches.workspaceId, workspaceId))
    .orderBy(desc(leadImportBatches.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows;
}

export async function getImportBatch(workspaceId, batchId) {
  const batch = await loadBatch(workspaceId, batchId);
  if (!batch) return null;
  const rows = await loadBatchRows(batchId);
  return {
    batch,
    rows: rows.map((row) => ({
      id: row.id,
      rowNumber: row.rowNumber,
      raw: row.raw,
      normalized: row.normalized,
      status: row.status,
      errors: row.errors,
      warnings: row.warnings,
      duplicateLeadId: row.duplicateLeadId,
      importedLeadId: row.importedLeadId,
    })),
    totals: batch.totals,
  };
}

export async function updateImportRows({
  workspaceId,
  userId,
  batchId,
  corrections,
}) {
  const batch = await loadBatch(workspaceId, batchId);
  assertPreview(batch);
  if (!Array.isArray(corrections) || corrections.length === 0) {
    return getImportBatch(workspaceId, batchId);
  }

  const rows = await loadBatchRows(batchId);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seenKeys = new Map();

  for (const row of rows) {
    const correction = corrections.find((item) => item.rowId === row.id);
    if (correction?.values) {
      row.raw = { ...row.raw, ...correction.values };
    }
  }

  // Re-evaluate in row order so within-batch duplicate detection stays stable.
  const evaluated = [];
  for (const row of rows) {
    if (!byId.has(row.id)) continue;
    const { normalized, errors, warnings } = normalizeImportRow(row.raw);
    let status = 'valid';
    let duplicateLeadId = null;
    if (Object.keys(errors).length > 0) {
      status = 'invalid';
    } else {
      const duplicate = await detectDuplicate(workspaceId, normalized, seenKeys);
      duplicateLeadId = duplicate.duplicateLeadId;
      if (duplicate.reasons.length > 0) {
        status = 'duplicate';
        warnings.push(`Possible duplicate: ${duplicate.reasons.join(', ')}.`);
      }
    }
    evaluated.push({ row, normalized, errors, warnings, status, duplicateLeadId });
  }

  const totals = summarize(evaluated);
  const signature = importSignature(
    evaluated.map((item) => ({ rowNumber: item.row.rowNumber, normalized: item.normalized })),
  );

  await runAtomic(async (executor) => {
    for (const item of evaluated) {
      await executor
        .update(leadImportRows)
        .set({
          raw: item.row.raw,
          normalized: item.normalized,
          status: item.status,
          errors: item.errors,
          warnings: item.warnings,
          duplicateLeadId: item.duplicateLeadId,
        })
        .where(eq(leadImportRows.id, item.row.id));
    }
    await executor
      .update(leadImportBatches)
      .set({ totals, signature, updatedAt: new Date() })
      .where(eq(leadImportBatches.id, batchId));
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'lead.import_correct',
    resourceType: 'lead_import_batch',
    resourceId: batchId,
    metadata: { correctedRows: corrections.length },
  });

  const detail = await getImportBatch(workspaceId, batchId);
  const committedSame = await getDb()
    .select({ id: leadImportBatches.id })
    .from(leadImportBatches)
    .where(
      and(
        eq(leadImportBatches.workspaceId, workspaceId),
        eq(leadImportBatches.signature, signature),
        eq(leadImportBatches.status, 'committed'),
      ),
    )
    .limit(1);

  return {
    ...detail,
    repeatedImport: Boolean(committedSame[0]),
    previousBatchId: committedSame[0]?.id || null,
  };
}

function composeNotes(batch, row) {
  const normalized = row.normalized;
  const lines = [];
  lines.push(
    `Imported from ${batch.source} on ${new Date(batch.createdAt).toISOString().slice(0, 10)} (batch ${batch.id.slice(0, 8)}).`,
  );
  if (normalized.callStatus) lines.push(`Call status: ${normalized.callStatus}.`);
  if (normalized.callDate) {
    lines.push(`Call date: ${new Date(normalized.callDate).toISOString().slice(0, 10)}.`);
  }
  if (normalized.dateAdded) {
    lines.push(`Spreadsheet date added: ${new Date(normalized.dateAdded).toISOString().slice(0, 10)}.`);
  }
  if (normalized.nextMeetingDate) {
    const time = normalized.nextMeetingTime ? ` ${normalized.nextMeetingTime}` : '';
    lines.push(
      `Reported next meeting: ${new Date(normalized.nextMeetingDate).toISOString().slice(0, 10)}${time}.`,
    );
  }
  if (normalized.followUpNote) lines.push(`Follow-up note: ${normalized.followUpNote}.`);
  const money = [];
  if (normalized.reportedAmountReceivedCents != null) {
    money.push(`received ${(normalized.reportedAmountReceivedCents / 100).toFixed(2)}`);
  }
  if (normalized.reportedOutstandingCents != null) {
    money.push(`outstanding ${(normalized.reportedOutstandingCents / 100).toFixed(2)}`);
  }
  if (normalized.reportedProjectCostCents != null) {
    money.push(`project cost ${(normalized.reportedProjectCostCents / 100).toFixed(2)}`);
  }
  if (money.length > 0) {
    lines.push(`Reported by owner (unverified): ${money.join(', ')}.`);
  }
  return lines.join('\n');
}

export async function commitImportBatch({
  workspaceId,
  userId,
  batchId,
  confirmRepeat = false,
}) {
  const batch = await loadBatch(workspaceId, batchId);
  assertPreview(batch);

  const committedSame = await getDb()
    .select({ id: leadImportBatches.id })
    .from(leadImportBatches)
    .where(
      and(
        eq(leadImportBatches.workspaceId, workspaceId),
        eq(leadImportBatches.signature, batch.signature),
        eq(leadImportBatches.status, 'committed'),
      ),
    )
    .limit(1);

  if (committedSame[0] && !confirmRepeat) {
    throw new ApiError(
      409,
      'REPEATED_IMPORT',
      'This exact spreadsheet content was already imported.',
      {
        confirmRepeat: 'Confirm to import the same rows again as new leads.',
        previousBatchId: committedSame[0].id,
      },
    );
  }

  const rows = await loadBatchRows(batchId);
  const validRows = rows.filter((row) => row.status === 'valid');
  if (validRows.length === 0) {
    throw new ApiError(
      422,
      'NOTHING_TO_IMPORT',
      'There are no valid rows to import. Correct the highlighted rows first.',
    );
  }

  const result = await runAtomic(async (executor) => {
    const locked = await executor
      .update(leadImportBatches)
      .set({
        status: 'committed',
        approvedByUserId: userId,
        committedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(leadImportBatches.workspaceId, workspaceId),
          eq(leadImportBatches.id, batchId),
          eq(leadImportBatches.status, 'preview'),
        ),
      )
      .returning({ id: leadImportBatches.id });
    if (!locked[0]) {
      throw new ApiError(409, 'IMPORT_LOCKED', 'This import batch is already closed.');
    }

    let imported = 0;
    for (const row of validRows) {
      const normalized = row.normalized;
      const inserted = await executor
        .insert(leads)
        .values({
          workspaceId,
          companyName: normalized.companyName,
          contactName: normalized.contactName,
          phone: normalized.phone,
          website: normalized.website,
          source: 'owner_import',
          status: 'new',
          priority: 'medium',
          requirementsInitial: normalized.requirementsInitial,
          requirementsDetailed: normalized.requirementsDetailed,
          reportedAmountReceivedCents: normalized.reportedAmountReceivedCents,
          reportedOutstandingCents: normalized.reportedOutstandingCents,
          reportedProjectCostCents: normalized.reportedProjectCostCents,
          reportedAmountVerified: false,
          importBatchId: batchId,
          nextFollowUpAt: normalized.followUpDate,
          nextAction: normalized.followUpNote,
          notes: composeNotes(batch, row),
          createdByUserId: userId,
        })
        .returning({ id: leads.id });
      const leadId = inserted[0].id;
      imported += 1;

      await executor.insert(leadActivities).values({
        workspaceId,
        leadId,
        actorUserId: userId,
        type: 'imported',
        body: `Lead imported from owner spreadsheet (batch ${batchId.slice(0, 8)}).`,
        metadata: {
          batchId,
          rowNumber: row.rowNumber,
          source: batch.source,
          reportedAmounts: {
            received: normalized.reportedAmountReceivedCents,
            outstanding: normalized.reportedOutstandingCents,
            projectCost: normalized.reportedProjectCostCents,
          },
        },
      });

      await executor.insert(leadStatusHistory).values({
        workspaceId,
        leadId,
        fromStatus: null,
        toStatus: 'new',
        note: 'Imported from owner spreadsheet.',
        changedByUserId: userId,
      });

      await executor
        .update(leadImportRows)
        .set({ status: 'imported', importedLeadId: leadId })
        .where(eq(leadImportRows.id, row.id));
    }

    return { imported };
  });

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'lead.import_commit',
    resourceType: 'lead_import_batch',
    resourceId: batchId,
    metadata: {
      imported: result.imported,
      skipped: batch.totals?.rows ? batch.totals.rows - result.imported : null,
      confirmedRepeat: Boolean(confirmRepeat),
    },
  });

  return {
    ...(await getImportBatch(workspaceId, batchId)),
    importedCount: result.imported,
  };
}

export async function cancelImportBatch({ workspaceId, userId, batchId }) {
  const batch = await loadBatch(workspaceId, batchId);
  assertPreview(batch);

  await getDb()
    .update(leadImportBatches)
    .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(leadImportBatches.workspaceId, workspaceId),
        eq(leadImportBatches.id, batchId),
      ),
    );

  await recordAudit({
    workspaceId,
    actorUserId: userId,
    action: 'lead.import_cancel',
    resourceType: 'lead_import_batch',
    resourceId: batchId,
  });

  return getImportBatch(workspaceId, batchId);
}

export async function getImportOverview(workspaceId) {
  const rows = await getDb()
    .select({
      status: leadImportBatches.status,
      count: sql`count(*)::int`,
      imported: sql`coalesce(sum((${leadImportBatches.totals} ->> 'valid')::int), 0)::int`,
    })
    .from(leadImportBatches)
    .where(eq(leadImportBatches.workspaceId, workspaceId))
    .groupBy(leadImportBatches.status);

  const overview = { batches: 0, previews: 0, committed: 0, cancelled: 0, importedLeads: 0 };
  for (const row of rows) {
    const count = Number(row.count || 0);
    overview.batches += count;
    if (row.status === 'preview') overview.previews = count;
    if (row.status === 'committed') {
      overview.committed = count;
      overview.importedLeads += Number(row.imported || 0);
    }
    if (row.status === 'cancelled') overview.cancelled = count;
  }
  return overview;
}

// Kept for the import history screen so a cancelled preview can be re-opened
// only as a new batch (history itself is never edited).
export async function deletePreviewRows({ workspaceId, batchId }) {
  const batch = await loadBatch(workspaceId, batchId);
  assertPreview(batch);
  await getDb()
    .delete(leadImportRows)
    .where(
      and(
        eq(leadImportRows.workspaceId, workspaceId),
        eq(leadImportRows.batchId, batchId),
        inArray(leadImportRows.status, ['pending']),
      ),
    );
}
