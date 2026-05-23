import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveSystemPath } from '../path';

describe('resolveSystemPath', () => {
  it('resolves relative paths from a base path', () => {
    expect(resolveSystemPath('/tmp/root', 'nested/file.txt')).toBe(resolve('/tmp/root/nested/file.txt'));
  });

  it('keeps absolute paths absolute', () => {
    expect(resolveSystemPath('/tmp/root', '/var/log/app.log')).toBe(resolve('/var/log/app.log'));
  });
});
