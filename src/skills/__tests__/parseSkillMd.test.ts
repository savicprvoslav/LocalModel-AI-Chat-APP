import { parseSkillMd } from '../parseSkillMd';

describe('parseSkillMd', () => {
  it('parses a minimal text skill', () => {
    const md = [
      '---',
      'name: kitchen-adventure',
      'description: Act as a dungeon master for a kitchen-themed adventure.',
      '---',
      '',
      '# Instructions',
      '',
      'Be the DM.'
    ].join('\n');
    const r = parseSkillMd(md);
    expect(r.name).toBe('kitchen-adventure');
    expect(r.description).toBe(
      'Act as a dungeon master for a kitchen-themed adventure.'
    );
    expect(r.kind).toBe('text');
    expect(r.body).toContain('# Instructions');
    expect(r.body).toContain('Be the DM.');
    expect(r.metadata).toEqual({});
  });

  it('detects JS skill kind from run_js reference', () => {
    const md = [
      '---',
      'name: qr-code',
      'description: Generates a QR code.',
      '---',
      '',
      'You MUST use the `run_js` tool with the following parameters.'
    ].join('\n');
    const r = parseSkillMd(md);
    expect(r.kind).toBe('js');
  });

  it('detects native skill kind from run_intent reference', () => {
    const md = [
      '---',
      'name: send-email',
      'description: Send an email.',
      '---',
      '',
      'Call the `run_intent` tool with intent: send_email.'
    ].join('\n');
    const r = parseSkillMd(md);
    expect(r.kind).toBe('native');
  });

  it('parses metadata block with homepage and require-secret', () => {
    const md = [
      '---',
      'name: restaurant-roulette',
      'description: Spin for a restaurant.',
      'metadata:',
      '  homepage: https://github.com/example/repo',
      '  require-secret: true',
      '  require-secret-description: Gemini API key',
      '---',
      '',
      'Use `run_js`.'
    ].join('\n');
    const r = parseSkillMd(md);
    expect(r.metadata.homepage).toBe('https://github.com/example/repo');
    expect(r.metadata.requireSecret).toBe(true);
    expect(r.metadata.requireSecretDescription).toBe('Gemini API key');
  });

  it('handles quoted strings (descriptions with colons)', () => {
    const md = [
      '---',
      'name: tricky',
      'description: "Time tracker: focus, break, repeat."',
      '---',
      '',
      'Body.'
    ].join('\n');
    const r = parseSkillMd(md);
    expect(r.description).toBe('Time tracker: focus, break, repeat.');
  });

  it('tolerates CRLF line endings and trailing whitespace', () => {
    const md =
      '---\r\nname: crlf\r\ndescription: A skill.\r\n---\r\n\r\nbody  \r\n';
    const r = parseSkillMd(md);
    expect(r.name).toBe('crlf');
    expect(r.body).toBe('body');
  });

  it('throws when frontmatter block is missing', () => {
    expect(() => parseSkillMd('# Just a markdown file\n\nno frontmatter')).toThrow(
      /missing a frontmatter/i
    );
  });

  it('throws when required field is missing', () => {
    const md = ['---', 'name: no-desc', '---', '', 'body'].join('\n');
    expect(() => parseSkillMd(md)).toThrow(/description/i);
  });

  it('throws on unparseable lines rather than dropping them silently', () => {
    const md = ['---', 'name: bad', 'description: ok', 'this is garbage', '---'].join(
      '\n'
    );
    expect(() => parseSkillMd(md)).toThrow(/Unparseable/i);
  });
});
