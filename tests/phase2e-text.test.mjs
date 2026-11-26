import test from 'node:test';
import assert from 'node:assert/strict';

const text = await import('@/lib/knowledge/text');
const validation = await import('@/lib/knowledge/validation');
const constants = await import('@/lib/knowledge/constants');

test('contentHash ignores case and whitespace but not wording', async () => {
  const a = text.contentHash('Company   Profile\n\nWe build websites.');
  const b = text.contentHash('company profile we build websites.');
  const c = text.contentHash('company profile we build applications.');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 64);
});

test('normalizeText strips control characters and trailing spaces', async () => {
  const normalized = text.normalizeText('Title  \r\nBody\u0001here\r\n\r\n\r\n\r\nEnd');
  assert.equal(normalized, 'Title\nBody here\n\n\nEnd');
});

test('sanitizeFilename removes paths and leading dots', async () => {
  assert.equal(text.sanitizeFilename('../../etc/passwd'), 'passwd');
  assert.equal(text.sanitizeFilename('C:\\docs\\brand.md'), 'brand.md');
  assert.equal(text.sanitizeFilename('...hidden.txt'), 'hidden.txt');
  assert.equal(text.sanitizeFilename(''), 'document.txt');
});

test('document format detection is limited to text formats', async () => {
  assert.equal(text.detectDocumentFormat('notes.md').format, 'markdown');
  assert.equal(text.detectDocumentFormat('DATA.CSV').format, 'csv');
  assert.equal(text.detectDocumentFormat('payload.json').format, 'json');
  assert.equal(text.detectDocumentFormat('plain.txt').format, 'text');
  assert.equal(text.detectDocumentFormat('report.pdf'), null);
  assert.equal(text.detectDocumentFormat('contract.docx'), null);
});

test('decodeDocumentText rejects binary, invalid UTF-8 and empty input', async () => {
  assert.throws(
    () => text.decodeDocumentText(Buffer.from([0x41, 0x00, 0x42])),
    (error) => error.code === 'UNSUPPORTED_FORMAT',
  );
  assert.throws(
    () => text.decodeDocumentText(Buffer.from([0xff, 0xfe, 0xfd])),
    (error) => error.code === 'UNSUPPORTED_ENCODING',
  );
  assert.throws(
    () => text.decodeDocumentText(Buffer.from('   \n  \n')),
    (error) => error.code === 'EMPTY_DOCUMENT',
  );
  assert.equal(
    text.decodeDocumentText(Buffer.from('# Heading\n\nBody text')),
    '# Heading\n\nBody text',
  );
});

test('secret detection covers common credential shapes', async () => {
  assert.ok(text.findSecret('password: hunter2'));
  assert.ok(text.findSecret('API_KEY=abc123'));
  assert.ok(text.findSecret('sk-abcdefghijklmnop1234'));
  assert.ok(text.findSecret('AKIAABCDEFGHIJKLMNOP'));
  assert.ok(text.findSecret('-----BEGIN RSA PRIVATE KEY-----'));
  assert.equal(text.findSecret('We build websites for clients.'), null);
  assert.equal(text.findSecret('The password policy requires 12 characters.'), null);
});

test('redactSecrets removes values without throwing', async () => {
  const redacted = text.redactSecrets('token=sk-abcdefghijklmnop1234 and more');
  assert.equal(redacted.includes('sk-abcdefghijklmnop1234'), false);
  assert.ok(redacted.includes('[redacted]'));
});

test('chunkText keeps headings, respects the target and overlaps', async () => {
  const body = Array.from({ length: 12 }, (_, index) => `Paragraph ${index} `.repeat(20)).join(
    '\n\n',
  );
  const chunks = text.chunkText(`# Section one\n\n${body}`, { targetChars: 500 });
  assert.ok(chunks.length > 1);
  assert.equal(chunks[0].heading, 'Section one');
  assert.equal(chunks[0].index, 0);
  assert.ok(chunks.every((chunk) => chunk.content.length > 0 && chunk.charCount > 0));
  assert.ok(chunks[1].content.length > chunks[1].charCount - 1);
});

test('chunkText returns no chunks for empty input', async () => {
  assert.deepEqual(text.chunkText('   \n  '), []);
});

test('clipText truncates with an ellipsis', async () => {
  assert.equal(text.clipText('abcdef', 10), 'abcdef');
  assert.equal(text.clipText('abcdefghij', 5), 'abcd…');
});

test('estimateTokens uses a four-character heuristic', async () => {
  assert.equal(text.estimateTokens(0), 1);
  assert.equal(text.estimateTokens(8), 2);
  assert.equal(text.estimateTokens(9), 3);
});

test('knowledge search schema requires a useful term', async () => {
  await assert.rejects(
    validation.knowledgeSearchSchema.validate({ q: 'a' }, { abortEarly: false }),
  );
  const parsed = await validation.knowledgeSearchSchema.validate({ q: 'zebra' });
  assert.equal(parsed.category, 'any');
  assert.equal(parsed.includeChunks, true);
  assert.equal(parsed.limit, 10);
});

test('knowledge update schema leaves tags untouched when omitted', async () => {
  const parsed = await validation.knowledgeEntryUpdateSchema.validate({
    title: 'Updated title',
  });
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'tags'), false);
});

test('memory create schema requires the matching scope field', async () => {
  const base = {
    key: 'Client tone',
    content: 'Use a friendly, concise tone for this client.',
  };
  await assert.rejects(
    validation.memoryCreateSchema.validate(
      { ...base, memoryType: 'client' },
      { abortEarly: false },
    ),
    (error) => error.inner.some((issue) => issue.path === 'clientId'),
  );
  const parsed = await validation.memoryCreateSchema.validate({
    ...base,
    memoryType: 'client',
    clientId: '11111111-1111-4111-8111-111111111111',
  });
  assert.equal(parsed.confidence, 'medium');
  assert.equal(parsed.verified, false);
  assert.equal(parsed.sourceType, 'manual');
});

test('context profiles exist for every agent type', async () => {
  const agentTypes = await import('@/lib/ai/agent-types');
  for (const type of agentTypes.AGENT_TYPES) {
    const profile = constants.contextProfileFor(type.key);
    assert.ok(Array.isArray(profile.categories));
    assert.ok(profile.categories.length > 0);
    assert.ok(Array.isArray(profile.memoryTypes));
  }
  assert.equal(
    constants.contextProfileFor('customer_support').categories.includes(
      'client_specific',
    ),
    true,
  );
});
