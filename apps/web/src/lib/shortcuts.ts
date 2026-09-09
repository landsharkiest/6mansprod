import { RANKS, type Rank } from '@6mansdle/shared';

/** '1'..'9' map onto RANKS in order: S X A B+ B C D E H. */
export const RANK_SHORTCUT_KEYS: readonly string[] = RANKS.map((_, i) => String(i + 1));

/** Returns the rank bound to a "1".."9" keypress, or undefined if the key isn't one of them. */
export function rankForKey(key: string): Rank | undefined {
  const index = RANK_SHORTCUT_KEYS.indexOf(key);
  return index === -1 ? undefined : RANKS[index];
}

/** 'r' or 'R' replays the clip. */
export function isReplayKey(key: string): boolean {
  return key === 'r' || key === 'R';
}

/** Enter or Space, on the result screen, advances to the next clip in endless mode. */
export function isConfirmKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar';
}

const TEXT_INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
/** Elements that already react to Enter/Space natively (click, play/pause). */
const NATIVE_ACTIVATION_TAGS = new Set(['BUTTON', 'A', 'VIDEO', 'SUMMARY']);

/**
 * True when Enter/Space should be left to the focused element: a focused button or link would
 * otherwise fire its click AND our handler (advancing two clips), and a focused video uses Space
 * to play/pause.
 */
export function isNativeActivationTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && NATIVE_ACTIVATION_TAGS.has(target.tagName);
}

/**
 * True when keyboard shortcuts should be ignored because focus is inside a form control
 * (typing "1" in a text field shouldn't pick rank S).
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (TEXT_INPUT_TAGS.has(target.tagName)) return true;
  // `isContentEditable` isn't reliably computed in every DOM implementation (e.g. jsdom),
  // so also check the attribute directly.
  return target.isContentEditable || target.closest('[contenteditable="true"], [contenteditable=""]') !== null;
}
