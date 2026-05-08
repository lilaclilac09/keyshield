/** Minimal Prometheus text format parser. */

export interface Sample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

export function parseMetrics(text: string): Sample[] {
  const samples: Sample[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    // metric_name{label="val",...} value [timestamp]
    const braceOpen = line.indexOf('{');
    const braceClose = line.lastIndexOf('}');
    let name: string;
    let labels: Record<string, string> = {};
    let rest: string;

    if (braceOpen !== -1 && braceClose !== -1) {
      name = line.slice(0, braceOpen);
      const labelStr = line.slice(braceOpen + 1, braceClose);
      rest = line.slice(braceClose + 1).trim();
      for (const pair of labelStr.split(',')) {
        const eq = pair.indexOf('=');
        if (eq === -1) continue;
        const k = pair.slice(0, eq).trim();
        const v = pair.slice(eq + 1).trim().replace(/^"|"$/g, '');
        labels[k] = v;
      }
    } else {
      const space = line.indexOf(' ');
      if (space === -1) continue;
      name = line.slice(0, space);
      rest = line.slice(space + 1).trim();
    }

    const valuePart = rest.split(' ')[0];
    const value = parseFloat(valuePart);
    if (!isNaN(value)) samples.push({ name, labels, value });
  }
  return samples;
}

export function get(samples: Sample[], name: string, labelFilter?: Record<string, string>): Sample[] {
  return samples.filter(s => {
    if (s.name !== name) return false;
    if (labelFilter) {
      for (const [k, v] of Object.entries(labelFilter)) {
        if (s.labels[k] !== v) return false;
      }
    }
    return true;
  });
}

export function sum(samples: Sample[], name: string, labelFilter?: Record<string, string>): number {
  return get(samples, name, labelFilter).reduce((a, s) => a + s.value, 0);
}
