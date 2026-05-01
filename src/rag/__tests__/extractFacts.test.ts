import { parseExtractedFacts } from '../extraction/extractFacts';

describe('parseExtractedFacts', () => {
  it('parses well-formed lines', () => {
    const raw = [
      'FACT: Tom Reyes | backend engineer worried about Q4',
      'FACT: Acme Cloud | customer\'s primary product, runs on Postgres'
    ].join('\n');
    const got = parseExtractedFacts(raw);
    expect(got).toEqual([
      { name: 'Tom Reyes', description: 'backend engineer worried about Q4' },
      {
        name: 'Acme Cloud',
        description: "customer's primary product, runs on Postgres"
      }
    ]);
  });

  it('skips NONE response', () => {
    expect(parseExtractedFacts('NONE')).toEqual([]);
    expect(parseExtractedFacts('  none\n')).toEqual([]);
  });

  it('skips malformed lines', () => {
    const raw = [
      'FACT: Good | line ok',
      'just a line of text',
      'FACT: missing description',
      'FACT:  | only description',
      'FACT: Another | also fine'
    ].join('\n');
    const got = parseExtractedFacts(raw);
    expect(got.map((e) => e.name)).toEqual(['Good', 'Another']);
  });

  it('handles whitespace and blank lines', () => {
    const raw = '\n\n  FACT: A | desc \n  \nFACT:B|c\n';
    const got = parseExtractedFacts(raw);
    expect(got).toEqual([
      { name: 'A', description: 'desc' },
      { name: 'B', description: 'c' }
    ]);
  });

  it('case-insensitive FACT prefix', () => {
    const raw = 'fact: lower | works\nFact: Title | also works';
    const got = parseExtractedFacts(raw);
    expect(got.length).toBe(2);
  });
});
