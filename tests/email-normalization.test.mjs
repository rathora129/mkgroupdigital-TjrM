import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmailIdentifier } from '../src/lib/auth/email-normalization.js';
import { inviteSchema } from '@/lib/workspace/validation';

test('normalizes case and surrounding whitespace', () => {
  assert.equal(normalizeEmailIdentifier('  Owner@Example.COM '), 'owner@example.com');
});

test('applies NFKC before validating so lookalike @ is folded, not split', () => {
  assert.equal(
    normalizeEmailIdentifier('ｉｎｖｉｔｅ＠ｅｘａｍｐｌｅ．ｃｏｍ'),
    'invite@example.com',
  );
});

test('preserves legitimate addresses', () => {
  assert.equal(normalizeEmailIdentifier('user+tag@example.com'), 'user+tag@example.com');
  assert.equal(normalizeEmailIdentifier("o'brien@example.com"), "o'brien@example.com");
  assert.equal(normalizeEmailIdentifier('a@b'), 'a@b');
});

test('rejects non-string and empty identifiers', () => {
  for (const value of [undefined, null, 42, {}, '', '   ']) {
    assert.equal(normalizeEmailIdentifier(value), null);
  }
});

test('requires exactly one @ with a non-empty local part and domain', () => {
  for (const value of ['plainaddress', '@example.com', 'user@', 'a@@b.com', 'a@b@c.com']) {
    assert.equal(normalizeEmailIdentifier(value), null);
  }
});

test('rejects quoted local parts and comma-separated address lists', () => {
  for (const value of ['"quoted"@example.com', 'a@b.com,c@d.com', 'a,b@example.com']) {
    assert.equal(normalizeEmailIdentifier(value), null);
  }
});

test('rejects internal whitespace, control characters and overlong input', () => {
  assert.equal(normalizeEmailIdentifier('a b@example.com'), null);
  assert.equal(normalizeEmailIdentifier('a@exa\nmple.com'), null);
  assert.equal(normalizeEmailIdentifier('a\u0000@example.com'), null);
  assert.equal(normalizeEmailIdentifier(`${'a'.repeat(250)}@example.com`), null);
});

test('invitation validation accepts and stores the same canonical form', async () => {
  const result = await inviteSchema.validate({
    email: '  Ｉｎｖｉｔｅｅ＠Ｅｘａｍｐｌｅ．ｃｏｍ ',
    role: 'member',
  });
  assert.equal(result.email, 'invitee@example.com');
});

test('invitation validation rejects identifiers sign-in would reject', async () => {
  for (const email of ['a@b.com,c@d.com', '"x"@example.com', 'a@@b.com']) {
    await assert.rejects(inviteSchema.validate({ email, role: 'member' }));
  }
});
