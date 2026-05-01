import { renderToolsBlock } from '../systemPrompt';
import { calculatorTool } from '../calculator';
import { webSearchTool } from '../webSearch';

describe('renderToolsBlock', () => {
  it('returns empty string when no tools are passed', () => {
    expect(renderToolsBlock([])).toBe('');
  });

  it('lists tool ids, descriptions, and params', () => {
    const block = renderToolsBlock([calculatorTool]);
    expect(block).toContain('TOOLS YOU CAN CALL:');
    expect(block).toContain('calculator');
    expect(block).toContain('expression');
    expect(block).toContain('TOOL CALL FORMAT');
    expect(block).toContain('<tool_call>');
    expect(block).toContain('</tool_call>');
  });

  it('includes all passed tools', () => {
    const block = renderToolsBlock([calculatorTool, webSearchTool]);
    expect(block).toContain('calculator');
    expect(block).toContain('web_search');
  });
});
