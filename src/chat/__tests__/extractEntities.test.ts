import {
  parseExtractedEntities,
  dedupeAgainstExisting
} from '../extractEntities';

describe('parseExtractedEntities', () => {
  it('parses well-formed lines', () => {
    const raw = [
      'ENTITY: Tom Reyes | backend engineer worried about Q4',
      'ENTITY: Acme Cloud | customer\'s primary product, runs on Postgres'
    ].join('\n');
    const got = parseExtractedEntities(raw);
    expect(got).toEqual([
      { name: 'Tom Reyes', description: 'backend engineer worried about Q4' },
      {
        name: 'Acme Cloud',
        description: "customer's primary product, runs on Postgres"
      }
    ]);
  });

  it('skips NONE response', () => {
    expect(parseExtractedEntities('NONE')).toEqual([]);
    expect(parseExtractedEntities('  none\n')).toEqual([]);
  });

  it('skips malformed lines', () => {
    const raw = [
      'ENTITY: Good | line ok',
      'just a line of text',
      'ENTITY: missing description',
      'ENTITY:  | only description',
      'ENTITY: Another | also fine'
    ].join('\n');
    const got = parseExtractedEntities(raw);
    expect(got.map((e) => e.name)).toEqual(['Good', 'Another']);
  });

  it('handles whitespace and blank lines', () => {
    const raw = '\n\n  ENTITY: A | desc \n  \nENTITY:B|c\n';
    const got = parseExtractedEntities(raw);
    expect(got).toEqual([
      { name: 'A', description: 'desc' },
      { name: 'B', description: 'c' }
    ]);
  });

  it('case-insensitive ENTITY prefix', () => {
    const raw = 'entity: lower | works\nEntity: Title | also works';
    const got = parseExtractedEntities(raw);
    expect(got.length).toBe(2);
  });
});

describe('dedupeAgainstExisting', () => {
  it('drops duplicates by case-insensitive name', () => {
    const proposed = [
      { name: 'Tom', description: 'a' },
      { name: 'tom', description: 'b' },
      { name: 'Sam', description: 'c' }
    ];
    const existing = [{ name: 'TOM' }];
    expect(dedupeAgainstExisting(proposed, existing)).toEqual([
      { name: 'Sam', description: 'c' }
    ]);
  });

  it('returns all when no overlap', () => {
    const proposed = [{ name: 'X', description: 'd' }];
    expect(dedupeAgainstExisting(proposed, [])).toEqual(proposed);
  });
});
