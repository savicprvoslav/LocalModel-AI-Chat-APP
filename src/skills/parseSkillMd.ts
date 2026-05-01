/**
 * Parser for the Google AI Edge Gallery SKILL.md format.
 * https://github.com/google-ai-edge/gallery/tree/main/skills
 *
 * A SKILL.md file is a YAML frontmatter block (between two `---` lines)
 * followed by the markdown instructions body. We support the subset of
 * YAML that real-world SKILL.md files actually use: top-level scalars,
 * one level of object nesting (the `metadata:` block), and quoted or
 * unquoted strings. No arrays, no anchors, no flow style.
 *
 * Three kinds of skills exist in the gallery: text-only (just a prompt),
 * JS skills (call `run_js`), and native skills (call `run_intent`). We
 * import all three the same way — as text-only on our side — and tag the
 * detected kind so the UI can warn that the runtime side isn't supported.
 */
export type ParsedSkillKind = 'text' | 'js' | 'native';

export type ParsedSkill = {
  name: string;
  description: string;
  metadata: {
    homepage?: string;
    requireSecret?: boolean;
    requireSecretDescription?: string;
  };
  /** The markdown body after the closing `---`. */
  body: string;
  kind: ParsedSkillKind;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export const parseSkillMd = (raw: string): ParsedSkill => {
  const text = raw.replace(/^﻿/, '').trimStart();
  const m = FRONTMATTER_RE.exec(text);
  if (!m) {
    throw new Error(
      'SKILL.md is missing a frontmatter block. Expected --- ... --- at the top of the file.'
    );
  }
  const fm = parseFrontmatter(m[1] ?? '');
  const body = (m[2] ?? '').trim();

  const name = stringField(fm, 'name');
  const description = stringField(fm, 'description');
  if (!name) throw new Error('SKILL.md frontmatter is missing required field: name');
  if (!description)
    throw new Error('SKILL.md frontmatter is missing required field: description');

  const metaRaw = fm.metadata;
  const metadata: ParsedSkill['metadata'] = {};
  if (metaRaw && typeof metaRaw === 'object') {
    const homepage = stringField(metaRaw as Record<string, unknown>, 'homepage');
    if (homepage) metadata.homepage = homepage;
    const reqSecret = (metaRaw as Record<string, unknown>)['require-secret'];
    if (reqSecret === true) metadata.requireSecret = true;
    const reqSecretDesc = stringField(
      metaRaw as Record<string, unknown>,
      'require-secret-description'
    );
    if (reqSecretDesc) metadata.requireSecretDescription = reqSecretDesc;
  }

  return { name, description, metadata, body, kind: detectKind(body) };
};

const detectKind = (body: string): ParsedSkillKind => {
  if (/\brun_intent\b/.test(body)) return 'native';
  if (/\brun_js\b/.test(body)) return 'js';
  return 'text';
};

const stringField = (obj: Record<string, unknown>, key: string): string | undefined => {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
};

/**
 * Minimal YAML-ish parser. Handles:
 *   - `key: value` and `key: "value"` and `key: 'value'`
 *   - one level of nesting via two-space indent (`metadata:\n  homepage: ...`)
 *   - boolean true/false (lowercase only — matches the gallery's usage)
 *   - blank lines and `# comments`
 * Anything else throws so we fail loudly on unexpected input rather than
 * silently dropping fields.
 */
const parseFrontmatter = (text: string): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  let currentParent: { key: string; obj: Record<string, unknown> } | null = null;
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (line === undefined) continue;
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(trimmed);

    if (indent === 0) {
      if (!m) throw new Error(`Unparseable line in SKILL.md frontmatter: ${trimmed}`);
      const key = m[1] ?? '';
      const rawVal = m[2] ?? '';
      if (rawVal === '') {
        const child: Record<string, unknown> = {};
        out[key] = child;
        currentParent = { key, obj: child };
      } else {
        out[key] = coerceScalar(rawVal);
        currentParent = null;
      }
    } else if (indent >= 2 && currentParent) {
      if (!m)
        throw new Error(`Unparseable nested line in SKILL.md frontmatter: ${trimmed}`);
      currentParent.obj[m[1] ?? ''] = coerceScalar(m[2] ?? '');
    } else {
      throw new Error(`Unexpected indentation in SKILL.md frontmatter: "${line}"`);
    }
  }

  return out;
};

const coerceScalar = (raw: string): string | boolean | number => {
  const v = raw.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
  return v;
};
