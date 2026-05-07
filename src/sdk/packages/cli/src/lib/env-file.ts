/**
 * Parse a `.env` file in the format the popup writes.
 *
 * Mirror of the writer in
 * `extension-sync/src/lib/env-export.ts`. Two-way symmetry is the
 * contract — anything the popup can produce, this parser can read.
 *
 * Supported lines:
 *   - `KEY=value`
 *   - `KEY="quoted value with spaces, #, $, \"escapes\""`
 *   - `KEY=value # trailing comment` (only outside quotes)
 *   - blank lines and `# comment-only` lines are skipped
 *
 * NOT supported (deliberately, to keep this small):
 *   - `export KEY=value` shell-style prefix
 *   - shell variable interpolation (`KEY=$OTHER`)
 *   - multi-line values
 */

export interface ParsedEnv {
  /** key → value, in insertion order. Duplicate keys: last one wins. */
  values: Map<string, string>;
  /** Lines we couldn't parse — surfaced for `keyshield doctor`. */
  warnings: Array<{ line: number; raw: string; reason: string }>;
}

const KEY_RX = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

export function parseEnvFile(content: string): ParsedEnv {
  const values = new Map<string, string>();
  const warnings: ParsedEnv['warnings'] = [];

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.replace(/^\s+/, '');
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const match = KEY_RX.exec(trimmed);
    if (!match) {
      warnings.push({ line: i + 1, raw, reason: 'not a KEY=value line' });
      continue;
    }
    const [, name, rest] = match;
    const parsed = parseValue(rest);
    if (parsed.error) {
      warnings.push({ line: i + 1, raw, reason: parsed.error });
      continue;
    }
    values.set(name, parsed.value);
  }

  return { values, warnings };
}

interface ValueResult {
  value: string;
  error?: string;
}

/**
 * Parse the right-hand side of `KEY=...`. Handles three cases:
 *   - empty (`KEY=`) → value is ""
 *   - double-quoted: process backslash escapes
 *   - bare: take everything up to a ` #` (with leading space) which
 *     is treated as a trailing comment
 */
function parseValue(rest: string): ValueResult {
  if (rest === '') return { value: '' };

  if (rest.startsWith('"')) {
    let out = '';
    let i = 1;
    while (i < rest.length) {
      const ch = rest[i];
      if (ch === '\\') {
        if (i + 1 >= rest.length) {
          return { value: '', error: 'dangling backslash inside quotes' };
        }
        const next = rest[i + 1];
        switch (next) {
          case '"': out += '"'; break;
          case '\\': out += '\\'; break;
          case '$': out += '$'; break;
          case 'n': out += '\n'; break;
          case 'r': out += '\r'; break;
          case 't': out += '\t'; break;
          default: out += next;
        }
        i += 2;
      } else if (ch === '"') {
        // Closing quote. Anything after must be whitespace + optional comment.
        const after = rest.slice(i + 1).trim();
        if (after !== '' && !after.startsWith('#')) {
          return { value: '', error: 'unexpected text after closing quote' };
        }
        return { value: out };
      } else {
        out += ch;
        i++;
      }
    }
    return { value: '', error: 'unterminated quoted value' };
  }

  // Bare value: cut at ` #` if present (trailing comment). A `#`
  // without a leading space is treated as part of the value because
  // it's common in URLs/passwords.
  const commentAt = rest.search(/\s#/);
  const v = commentAt >= 0 ? rest.slice(0, commentAt) : rest;
  return { value: v.trimEnd() };
}

/**
 * Normalise `KEY` → matchable form so the user can type `keyshield
 * get openai` and find `OPENAI` (or `openai-prod` → `OPENAI_PROD`).
 */
export function lookupKey(env: ParsedEnv, name: string): string | undefined {
  if (env.values.has(name)) return env.values.get(name);
  const upper = name.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  if (env.values.has(upper)) return env.values.get(upper);
  // Last resort: case-insensitive scan.
  const lower = name.toLowerCase();
  for (const [k, v] of env.values) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}
