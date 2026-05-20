import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('app css', () => {
  it('keeps secondary login buttons readable in hover and pressed states', () => {
    const css = readFileSync('src/styles/app.css', 'utf8');

    expect(css).toContain('.login-panel .login-panel__secondary');
    expect(css).toContain('.login-panel .login-panel__secondary:active');
    expect(css).toContain('color: var(--accent-strong);');
  });
});
