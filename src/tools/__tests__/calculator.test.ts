import { calculatorTool, evaluateExpression } from '../calculator';

const ctx = { timeoutMs: 1000 };

describe('evaluateExpression', () => {
  it('evaluates basic arithmetic', () => {
    expect(evaluateExpression('1 + 2')).toBe(3);
    expect(evaluateExpression('(13 * 9) + 4 / 2')).toBe(13 * 9 + 4 / 2);
    expect(evaluateExpression('10 % 3')).toBe(1);
  });

  it('rejects identifiers / function calls', () => {
    expect(() => evaluateExpression('process.exit(1)')).toThrow();
    expect(() => evaluateExpression('Math.PI')).toThrow();
    expect(() => evaluateExpression('alert(1)')).toThrow();
  });

  it('rejects empty input', () => {
    expect(() => evaluateExpression('')).toThrow(/empty/);
    expect(() => evaluateExpression('   ')).toThrow(/empty/);
  });

  it('rejects oversized input', () => {
    expect(() => evaluateExpression('1' + '+1'.repeat(200))).toThrow(/too long/);
  });

  it('rejects non-finite results', () => {
    expect(() => evaluateExpression('1/0')).toThrow(/finite/);
  });
});

describe('calculatorTool', () => {
  it('returns the result as a string', async () => {
    const out = await calculatorTool.run({ expression: '7 * 6' }, ctx);
    expect(out).toBe('42');
  });

  it('throws when expression is missing', async () => {
    await expect(calculatorTool.run({}, ctx)).rejects.toThrow(/expression/);
  });
});
