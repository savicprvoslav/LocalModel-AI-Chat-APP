import { runToolCall } from '../runner';
import { calculatorTool } from '../calculator';

describe('runToolCall', () => {
  it('returns the result on success', async () => {
    const inv = await runToolCall(calculatorTool, {
      name: 'calculator',
      args: { expression: '2 + 2' },
      raw: '<tool_call>{"name":"calculator","args":{"expression":"2 + 2"}}</tool_call>'
    });
    expect(inv.result).toBe('4');
    expect(inv.error).toBeUndefined();
    expect(inv.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('captures errors instead of throwing', async () => {
    const inv = await runToolCall(calculatorTool, {
      name: 'calculator',
      args: { expression: 'window.alert(1)' },
      raw: '<tool_call>...</tool_call>'
    });
    expect(inv.error).toBeDefined();
    expect(inv.result).toBe('');
  });
});
