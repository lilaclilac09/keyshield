import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ states: [] as any[], index: 0 }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: any) => {
    const i = hooks.index++;
    if (!(i in hooks.states)) hooks.states[i] = typeof initial === 'function' ? initial() : initial;
    return [hooks.states[i], (next: any) => { hooks.states[i] = typeof next === 'function' ? next(hooks.states[i]) : next; }];
  },
  useEffect: vi.fn(), useCallback: (fn: any) => fn,
}));

import { VaultSection } from '../src/web/components/sections/VaultSection';
import { AgentApprovalsPanel } from '../src/web/components/sections/AgentApprovalsPanel';

function find(node: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (!node || typeof node !== 'object') return;
  return predicate(node) ? node : find(node.props?.children, predicate);
}

beforeEach(() => {
  hooks.states = []; hooks.index = 0;
  vi.stubGlobal('window', { keyshieldDesktop: { broker: {} } });
});
afterEach(() => vi.unstubAllGlobals());

it('mounts approvals in the normal vault independently of the consent prompt', () => {
  const props = { items: [], total: 0, searchQuery: '', onAdd: vi.fn(), onDelete: vi.fn(), onDecrypt: vi.fn() };
  const tree = VaultSection(props);
  expect(find(tree, (node) => node.type === AgentApprovalsPanel)?.props.broker).toBe(window.keyshieldDesktop?.broker);
  hooks.index = 0; window.keyshieldDesktop = undefined;
  expect(find(VaultSection(props), (node) => node.type === AgentApprovalsPanel)).toBeUndefined();
});
