import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesDir = dirname(fileURLToPath(import.meta.url));

describe('app css', () => {
  it('keeps secondary login buttons readable in hover and pressed states', () => {
    const css = readFileSync(resolve(stylesDir, 'app.css'), 'utf8');

    expect(css).toContain('.login-panel .login-panel__secondary');
    expect(css).toContain('.login-panel .login-panel__secondary:active');
    expect(css).toContain('color: var(--accent-strong);');
  });
});
