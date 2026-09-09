import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Vite only warns on CSS syntax errors, and an unbalanced brace near the end of the stylesheet
 * silently drops every rule after it. A merge once did exactly that, so guard the file here.
 */
describe('global.css', () => {
  it('has balanced braces', () => {
    const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'global.css'), 'utf8');
    let depth = 0;
    let line = 1;
    for (const ch of css) {
      if (ch === '\n') line++;
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      expect(depth, `unexpected closing brace at line ${line}`).toBeGreaterThanOrEqual(0);
    }
    expect(depth, 'unclosed block at end of file').toBe(0);
  });
});
