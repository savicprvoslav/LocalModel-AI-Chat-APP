import type { Tool } from './types';

/**
 * Whitelisted-character expression evaluator. Only digits, operators,
 * parens, decimal points, and whitespace are allowed — no identifiers,
 * no function calls, no property access. That makes `Function(...)`
 * here as safe as a hand-rolled shunting-yard for arithmetic, while
 * supporting precedence and parens for free.
 */
const SAFE_EXPR = /^[\s\d+\-*/().%,eE]+$/;

export const evaluateExpression = (expr: string): number => {
  const trimmed = expr.trim();
  if (!trimmed) throw new Error('empty expression');
  if (trimmed.length > 200) throw new Error('expression too long');
  if (!SAFE_EXPR.test(trimmed)) {
    throw new Error('expression contains disallowed characters');
  }
  // The whitelist guarantees no identifiers/function calls reach the parser.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function(`return (${trimmed});`) as () => unknown;
  const value = fn();
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('expression did not evaluate to a finite number');
  }
  return value;
};

export const calculatorTool: Tool = {
  id: 'calculator',
  name: 'Calculator',
  description:
    'Evaluate an arithmetic expression. Supports + - * / % and parentheses. Use for any math the user asks about.',
  params: [
    {
      name: 'expression',
      type: 'string',
      required: true,
      description: 'Arithmetic expression, e.g. "(13 * 9) + 4 / 2".'
    }
  ],
  network: false,
  run: async (args) => {
    const expr = args.expression;
    if (typeof expr !== 'string') {
      throw new Error('calculator: missing string `expression`');
    }
    const value = evaluateExpression(expr);
    return String(value);
  }
};
