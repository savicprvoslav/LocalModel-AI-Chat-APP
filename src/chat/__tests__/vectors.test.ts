import { hashEmbed, cosineSimilarity, HASH_EMBED_DIM } from '../vectors';

describe('hashEmbed', () => {
  it('produces a vector of the configured dimension', () => {
    expect(hashEmbed('hello world').length).toBe(HASH_EMBED_DIM);
  });

  it('is deterministic for the same input', () => {
    const a = hashEmbed('Tom worried about Q4');
    const b = hashEmbed('Tom worried about Q4');
    expect(a).toEqual(b);
  });

  it('lowercases — case does not change embedding', () => {
    const a = hashEmbed('Q4 PLAN');
    const b = hashEmbed('q4 plan');
    expect(a).toEqual(b);
  });

  it('returns a unit vector (or zero) — L2 norm is 1 or 0', () => {
    const v = hashEmbed('this is some text');
    let n = 0;
    for (const x of v) n += x * x;
    expect(Math.sqrt(n)).toBeCloseTo(1, 5);
  });

  it('returns zero vector for input with no tokens', () => {
    const v = hashEmbed('!!!');
    expect(v.every((x) => x === 0)).toBe(true);
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical inputs', () => {
    const a = hashEmbed('Postgres migration in Q1');
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5);
  });

  it('is higher for similar inputs than dissimilar ones', () => {
    const q = hashEmbed('Tom and the Q4 timeline');
    const close = hashEmbed('Tom is worried about Q4');
    const far = hashEmbed('the kitchen sink leaks again');
    expect(cosineSimilarity(q, close)).toBeGreaterThan(
      cosineSimilarity(q, far)
    );
  });

  it('returns 0 for orthogonal zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 1, 1])).toBe(0);
  });

  it('handles different-length inputs by truncating to the shorter', () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0, 0, 0])).toBe(1);
  });
});
