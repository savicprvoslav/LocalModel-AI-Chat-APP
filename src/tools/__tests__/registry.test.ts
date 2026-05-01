import { ALL_TOOLS, DEFAULT_TOOLS_CONFIG, enabledTools, findTool } from '../registry';

describe('registry defaults', () => {
  it('returns no tools when the master gate is off', () => {
    expect(enabledTools(DEFAULT_TOOLS_CONFIG)).toHaveLength(0);
  });

  it('enables local tools but not network tools by default when gate is on', () => {
    const list = enabledTools({ tools_enabled: true, per_tool: {} });
    const ids = list.map((t) => t.id);
    expect(ids).toContain('calculator');
    expect(ids).toContain('current_time');
    expect(ids).toContain('search_conversations');
    expect(ids).not.toContain('web_search');
  });

  it('per-tool override turns a network tool on', () => {
    const list = enabledTools({
      tools_enabled: true,
      per_tool: { web_search: true }
    });
    expect(list.map((t) => t.id)).toContain('web_search');
  });

  it('per-tool override turns a local tool off', () => {
    const list = enabledTools({
      tools_enabled: true,
      per_tool: { calculator: false }
    });
    expect(list.map((t) => t.id)).not.toContain('calculator');
  });

  it('every tool has a unique id', () => {
    const ids = ALL_TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('findTool returns the tool by id', () => {
    expect(findTool('calculator')?.name).toBe('Calculator');
    expect(findTool('does_not_exist')).toBeUndefined();
  });
});
