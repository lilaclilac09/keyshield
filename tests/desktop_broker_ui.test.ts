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

it.each(['owner', 'unrelated'])('clears a displayed token only when revoking its %s agent', async (which) => {
  const agents = [{ agentId: 'A', name: 'same', revoked: false }, { agentId: 'B', name: 'same', revoked: false }];
  const issued = { agentId: 'A', name: 'same', token: 'synthetic-local-token', brokerUrl: 'http://127.0.0.1:12345' };
  const broker = { listAgents: vi.fn(async () => agents), listRequests: vi.fn(async () => []),
    approvalStatus: vi.fn(async () => ({ available: false })), revokeAgent: vi.fn(async () => {}) } as any;
  hooks.states = [agents, [], '', issued, '', false, Date.now(), false];
  const tree = AgentApprovalsPanel({ broker });
  find(tree, (node) => node.props?.['data-testid'] === `broker-revoke-agent-${which === 'owner' ? 'A' : 'B'}`).props.onClick();
  await vi.waitFor(() => expect(hooks.states[5]).toBe(false));
  hooks.index = 0;
  const token = find(AgentApprovalsPanel({ broker }), (node) => node.props?.['data-testid'] === 'broker-issued-token');
  if (which === 'owner') expect(token).toBeUndefined();
  else expect(token.props.children).toBe(issued.token);
});
