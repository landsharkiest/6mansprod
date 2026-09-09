import { describe, expect, it } from 'vitest';
import { isConfirmKey, isNativeActivationTarget, isReplayKey, isTypingTarget, rankForKey } from './shortcuts';

describe('rankForKey', () => {
  it('maps 1-9 onto S X A B+ B C D E H in order', () => {
    expect(rankForKey('1')).toBe('S');
    expect(rankForKey('2')).toBe('X');
    expect(rankForKey('3')).toBe('A');
    expect(rankForKey('4')).toBe('B+');
    expect(rankForKey('5')).toBe('B');
    expect(rankForKey('6')).toBe('C');
    expect(rankForKey('7')).toBe('D');
    expect(rankForKey('8')).toBe('E');
    expect(rankForKey('9')).toBe('H');
  });

  it('returns undefined for keys outside 1-9', () => {
    expect(rankForKey('0')).toBeUndefined();
    expect(rankForKey('a')).toBeUndefined();
    expect(rankForKey('')).toBeUndefined();
    expect(rankForKey('10')).toBeUndefined();
  });
});

describe('isReplayKey', () => {
  it('accepts r and R', () => {
    expect(isReplayKey('r')).toBe(true);
    expect(isReplayKey('R')).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isReplayKey('e')).toBe(false);
    expect(isReplayKey('1')).toBe(false);
  });
});

describe('isConfirmKey', () => {
  it('accepts Enter and Space', () => {
    expect(isConfirmKey('Enter')).toBe(true);
    expect(isConfirmKey(' ')).toBe(true);
  });
  it('rejects other keys', () => {
    expect(isConfirmKey('Escape')).toBe(false);
    expect(isConfirmKey('a')).toBe(false);
  });
});

describe('isTypingTarget', () => {
  it('is false for null or non-element targets', () => {
    expect(isTypingTarget(null)).toBe(false);
  });

  it('is true for input, textarea and select', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
  });

  it('is false for a plain button or div', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
  });

  it('is true for a contenteditable element', () => {
    // jsdom doesn't compute `isContentEditable`, so this exercises the attribute fallback
    // that real browsers would reach via the `isContentEditable` property.
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    expect(isTypingTarget(div)).toBe(true);
    div.remove();
  });

  it('is true for a child of a contenteditable element', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    const span = document.createElement('span');
    div.appendChild(span);
    document.body.appendChild(div);
    expect(isTypingTarget(span)).toBe(true);
    div.remove();
  });
});

describe('isNativeActivationTarget', () => {
  it('is true for focused buttons, links and videos so Enter/Space is not double-handled', () => {
    for (const tag of ['button', 'a', 'video']) {
      const el = document.createElement(tag);
      expect(isNativeActivationTarget(el)).toBe(true);
    }
  });
  it('is false for body, divs and null', () => {
    expect(isNativeActivationTarget(document.body)).toBe(false);
    expect(isNativeActivationTarget(document.createElement('div'))).toBe(false);
    expect(isNativeActivationTarget(null)).toBe(false);
  });
});
