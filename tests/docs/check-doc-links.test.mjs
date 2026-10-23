import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkFile, extractRelativeLinks, removeFencedCode } from '../../scripts/check-doc-links.mjs';

test('relative links exclude web URLs, fragments and fenced code blocks', () => {
  const fence = String.fromCharCode(96).repeat(3);
  const markdown = [
    '[good](../guide.md)', '[bad](missing.md)', '[web](https://example.org)',
    '[section](#overview)', '[site](/app)', fence + 'md', '[fixture](not-real.md)', fence,
  ].join('\n');
  assert.deepEqual(extractRelativeLinks(markdown), ['../guide.md', 'missing.md']);
  assert.ok(!removeFencedCode(markdown).includes('not-real.md'));
});

test('relative paths validate existing, missing and outside-repository links', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'samjuniors-doclinks-'));
  try {
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'guide.md'), 'hello');
    fs.writeFileSync(path.join(root, 'docs', 'index.md'),
      '[good](../guide.md)\n[bad](gone.md)\n[outside](../../../secrets.txt)\n');
    const result = checkFile('docs/index.md', root);
    assert.equal(result.checked, 2);
    assert.deepEqual(result.missing.map(m => m.reason),
      ['missing file or directory', 'outside repository']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('percent-encoded paths are decoded', () => {
  assert.deepEqual(extractRelativeLinks('[doc](my%20notes.md)'), ['my notes.md']);
});
