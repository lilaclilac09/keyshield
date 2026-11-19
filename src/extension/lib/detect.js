export const PATTERNS = Object.freeze([
  { provider: 'openai', source: '\\bsk-(?:proj-|svcacct-)[A-Za-z0-9_-]{20,}' },
  { provider: 'anthropic', source: '\\bsk-ant-api03-[A-Za-z0-9_-]{20,}' },
  { provider: 'stripe', source: '\\bsk_(?:test|live)_[A-Za-z0-9]{24,}' },
  { provider: 'github', source: '\\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})' },
  { provider: 'aws_access', source: '\\b(?:AKIA|ASIA)[A-Z0-9]{16}\\b' },
  { provider: 'aws_secret', source: '(?:AWS_SECRET_ACCESS_KEY|aws_secret_access_key)\\s*[=:]\\s*["\']?([A-Za-z0-9/+=]{40})', group: 1 },
]);

// Self-contained so the browser can serialize it into an isolated world.
export function detectPage(patterns, expectedOrigin, root = document) {
  if (root.location && root.location.origin !== expectedOrigin) return [];
  const hits = new Map();
  function visible(el) {
    if (!el.getClientRects().length) return false;
    for (let parent = el; parent; parent = parent.parentElement) {
      const style = root.defaultView.getComputedStyle(parent);
      if (parent.hidden || style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) {
        return false;
      }
    }
    return true;
  }
  for (const el of root.querySelectorAll('input, code, pre, output')) {
    if (el.type === 'password' || el.type === 'hidden' || !visible(el)) continue;
    let text = '';
    if (el.tagName === 'INPUT') text = el.value;
    else {
      const walker = root.createTreeWalker(el, 4);
      let node;
      while ((node = walker.nextNode())) {
        if (visible(node.parentElement)) text += `${node.textContent}\n`;
      }
    }
    if (!text) continue;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source.replace(/^\^/, '').replace(/\$$/, ''), 'g');
      for (const match of text.matchAll(regex)) {
        const value = match[pattern.group || 0];
        const end = match.index + match[0].length;
        if (!value || /[•●*…]/.test(value) || /[•●*…A-Za-z0-9_/-]/.test(text[end] || '') || /[•●*…]/.test(text[match.index - 1] || '')) continue;
        hits.set(value, { provider: pattern.provider, preview: `••••${value.slice(-4)}`, value });
      }
    }
  }
  return [...hits.values()];
}

export function pairAWS(candidates) {
  const access = candidates.filter((item) => item.provider === 'aws_access');
  const secret = candidates.filter((item) => item.provider === 'aws_secret');
  if (access.length !== 1 || secret.length !== 1) return candidates;
  return [...candidates.filter((item) => !['aws_access', 'aws_secret'].includes(item.provider)), {
    provider: 'aws', preview: `${access[0].preview} + ${secret[0].preview}`,
    value: JSON.stringify({ accessKeyId: access[0].value, secretAccessKey: secret[0].value }),
  }];
}
