import { describe, expect, it } from 'vitest';
import { generateToken } from './token.js';

describe('generateToken', () => {
  it('defaults to 12 characters', () => {
    expect(generateToken()).toHaveLength(12);
  });

  it('supports a custom length', () => {
    expect(generateToken(24)).toHaveLength(24);
    expect(generateToken(1)).toHaveLength(1);
  });

  it('only uses URL-safe alphanumeric characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateToken()).toMatch(/^[A-Za-z0-9]{12}$/);
    }
  });

  it('is not predictable / repeats collide only astronomically rarely', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateToken()));
    expect(tokens.size).toBe(500);
  });
});
