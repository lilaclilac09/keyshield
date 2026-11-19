export const PROVIDER_ORIGINS = Object.freeze([
  'https://platform.openai.com',
  'https://console.anthropic.com',
  'https://dashboard.stripe.com',
  'https://github.com',
  'https://console.aws.amazon.com',
]);

export function permissionFor(url, origins = PROVIDER_ORIGINS) {
  try {
    const parsed = new URL(url);
    if (!origins.includes(parsed.origin) || parsed.username || parsed.password) return null;
    if (parsed.origin === 'https://github.com' && !/^\/settings(?:\/|$)/.test(parsed.pathname)) return null;
    return `${parsed.origin}/*`;
  } catch {
    return null;
  }
}

export async function requireProvider(url, permissions, origins = PROVIDER_ORIGINS) {
  const permission = permissionFor(url, origins);
  if (!permission || !await permissions.contains({ origins: [permission] })) {
    throw new Error('not a supported provider page');
  }
  return new URL(url).origin;
}
