import {
  containsCompleteToolCall,
  formatToolResult,
  parseToolCalls,
  TOOL_CALL_CLOSE,
  TOOL_CALL_OPEN
} from '../parser';

describe('parseToolCalls', () => {
  it('parses a single well-formed call', () => {
    const text = `Sure, let me check.\n${TOOL_CALL_OPEN}{"name":"web_search","args":{"query":"AI news"}}${TOOL_CALL_CLOSE}`;
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe('web_search');
    expect(calls[0]?.args).toEqual({ query: 'AI news' });
    expect(calls[0]?.raw).toContain(TOOL_CALL_OPEN);
    expect(calls[0]?.raw).toContain(TOOL_CALL_CLOSE);
  });

  it('parses multiple calls in order', () => {
    const a = `${TOOL_CALL_OPEN}{"name":"a","args":{}}${TOOL_CALL_CLOSE}`;
    const b = `${TOOL_CALL_OPEN}{"name":"b","args":{"k":1}}${TOOL_CALL_CLOSE}`;
    const calls = parseToolCalls(`prelude ${a} middle ${b} tail`);
    expect(calls.map((c) => c.name)).toEqual(['a', 'b']);
    expect(calls[1]?.args).toEqual({ k: 1 });
  });

  it('skips malformed JSON without throwing', () => {
    const text = `${TOOL_CALL_OPEN}not json${TOOL_CALL_CLOSE}${TOOL_CALL_OPEN}{"name":"good","args":{}}${TOOL_CALL_CLOSE}`;
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe('good');
  });

  it('skips calls missing a name', () => {
    const text = `${TOOL_CALL_OPEN}{"args":{}}${TOOL_CALL_CLOSE}`;
    expect(parseToolCalls(text)).toEqual([]);
  });

  it('treats missing/non-object args as empty object', () => {
    const text = `${TOOL_CALL_OPEN}{"name":"x"}${TOOL_CALL_CLOSE}`;
    const calls = parseToolCalls(text);
    expect(calls[0]?.args).toEqual({});
  });

  it('ignores unterminated open tags', () => {
    const text = `${TOOL_CALL_OPEN}{"name":"x"`;
    expect(parseToolCalls(text)).toEqual([]);
  });

  it('returns empty list when there are no tags', () => {
    expect(parseToolCalls('just a normal reply')).toEqual([]);
  });
});

describe('containsCompleteToolCall', () => {
  it('returns true when both tags are present in order', () => {
    expect(
      containsCompleteToolCall(`${TOOL_CALL_OPEN}{"name":"x"}${TOOL_CALL_CLOSE}`)
    ).toBe(true);
  });

  it('returns false when only the open tag is present', () => {
    expect(containsCompleteToolCall(`${TOOL_CALL_OPEN}{"name":"x"`)).toBe(false);
  });

  it('returns false when neither tag is present', () => {
    expect(containsCompleteToolCall('hello')).toBe(false);
  });
});

describe('formatToolResult', () => {
  it('renders the call followed by a tool_result body', () => {
    const raw = `${TOOL_CALL_OPEN}{"name":"x"}${TOOL_CALL_CLOSE}`;
    const out = formatToolResult(raw, '42');
    expect(out).toContain(raw);
    expect(out).toContain('<tool_result>');
    expect(out).toContain('42');
    expect(out).toContain('</tool_result>');
  });

  it('renders errors with an ERROR prefix', () => {
    const raw = `${TOOL_CALL_OPEN}{"name":"x"}${TOOL_CALL_CLOSE}`;
    const out = formatToolResult(raw, '', 'boom');
    expect(out).toContain('ERROR: boom');
  });
});
