import { describe, expect, it } from 'vitest';
import { buildChallengeShareText, buildChallengeVerdictText } from './challenge';

describe('buildChallengeShareText', () => {
  it('includes the guessed rank and url', () => {
    const text = buildChallengeShareText({ guessedRank: 'B+', url: 'https://6mansdle.com/c/AbCd12eFgH34' });
    expect(text).toBe('Can you beat me on 6mansdle? I guessed B+ — https://6mansdle.com/c/AbCd12eFgH34');
  });

  it('never leaks whether the creator was correct', () => {
    const text = buildChallengeShareText({ guessedRank: 'S', url: 'https://6mansdle.com/c/token1234567' });
    expect(text).not.toMatch(/correct|wrong|right/i);
  });

  it('never mentions the clip id', () => {
    const text = buildChallengeShareText({ guessedRank: 'H', url: 'https://6mansdle.com/c/xyz123456789' });
    expect(text).not.toMatch(/clip/i);
  });
});

describe('buildChallengeVerdictText', () => {
  it('says the taker beat the creator when correct and the creator was wrong', () => {
    expect(buildChallengeVerdictText(true, false, 'Alice')).toBe('You beat Alice!');
  });

  it('says tie when both are correct', () => {
    expect(buildChallengeVerdictText(true, true, 'Alice')).toBe('Tie');
  });

  it('says tie when both are wrong', () => {
    expect(buildChallengeVerdictText(false, false, 'Alice')).toBe('Tie');
  });

  it('says the creator got it when the taker was wrong and the creator was right', () => {
    expect(buildChallengeVerdictText(false, true, 'Alice')).toBe('Alice got this one');
  });
});
