import { useCallback, useEffect, useState } from 'react';
import {
  approveBrokerRequest,
  type BrokerAgent,
  type BrokerRequest,
  type DesktopBroker,
} from '../../lib/desktop-broker';

const button = 'rounded-lg border border-[#243365] px-3 py-1.5 text-[12px] text-[#e8ecff] hover:bg-[#243365] disabled:opacity-50';

export function AgentApprovalsPanel({ broker }: { broker: DesktopBroker }) {
  const [agents, setAgents] = useState<BrokerAgent[]>([]);
  const [requests, setRequests] = useState<BrokerRequest[]>([]);
  const [name, setName] = useState('');
  const [issued, setIssued] = useState<{ name: string; token: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const refresh = useCallback(async () => {
    const [nextAgents, nextRequests] = await Promise.all([broker.listAgents(), broker.listRequests()]);
    setAgents(nextAgents);
    setRequests(nextRequests);
  }, [broker]);

  useEffect(() => {
    const update = () => { void refresh().catch(() => setError('Unable to refresh broker state')); };
    update();
    const unsubscribe = broker.onChanged(update);
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, [broker, refresh]);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch {
      setError('Action not completed. Approval requires a successful fresh passkey ceremony and an existing entry ID.');
    } finally {
      setBusy(false);
    }
  }

  const url = `http://127.0.0.1:${broker.port}`;
  const pending = requests.filter((request) => request.status === 'pending');
  const outcomes = requests.filter((request) => request.status !== 'pending').slice(-10).reverse();

  return (
    <section data-testid="agent-approvals-panel" className="rounded-xl border border-[#243365]/60 bg-[#131c39] p-4 space-y-4">
      <div>
        <h3 className="text-[14px] font-semibold text-[#e8ecff]">Local agent approvals</h3>
        <p className="text-[12px] text-[#8a96c2]">{url} · Every use requires a fresh passkey. Agents and requests disappear when the app restarts.</p>
      </div>
      {error && <p role="alert" data-testid="broker-error" className="text-[12px] text-red-300">{error}</p>}
      <form className="flex gap-2" onSubmit={(event) => {
        event.preventDefault();
        void act(async () => {
          setIssued(null);
          setIssued(await broker.registerAgent(name.trim()));
          setName('');
        });
      }}>
        <input data-testid="broker-agent-name" aria-label="Agent name" value={name} onChange={(event) => setName(event.target.value)}
          className="rounded-lg bg-[#0e1631] border border-[#243365] px-3 text-[12px] text-white" placeholder="Agent name" />
        <button data-testid="broker-register-agent" className={button} disabled={busy || !name.trim()}>Register agent</button>
      </form>
      {issued && (
        <div className="space-y-2 text-[12px] text-[#e8ecff]">
          <p>Token for {issued.name} — shown once. Keep it private.</p>
          <code data-testid="broker-issued-token" className="block break-all select-all">{issued.token}</code>
          <button data-testid="broker-copy-token" className={button} onClick={() => void act(async () => {
            const text = issued.token;
            if (window.keyshieldDesktop?.writeText) await window.keyshieldDesktop.writeText(text);
            else await navigator.clipboard.writeText(text);
          })}>Copy token</button>
          <button data-testid="broker-dismiss-token" className={button} onClick={() => setIssued(null)}>Dismiss token</button>
        </div>
      )}
      <ul className="space-y-2 text-[12px] text-[#a8b3d8]">
        {agents.map((agent) => (
          <li key={agent.agentId} data-testid={`broker-agent-${agent.agentId}`} className="flex items-center justify-between gap-2">
            <span>{agent.name} {agent.revoked ? '(revoked)' : ''}</span>
            {!agent.revoked && <button data-testid={`broker-revoke-agent-${agent.agentId}`} className={button} disabled={busy}
              onClick={() => void act(async () => { await broker.revokeAgent(agent.agentId); setIssued(null); })}>Revoke agent</button>}
          </li>
        ))}
      </ul>
      <h4 className="text-[12px] font-semibold text-white">Pending requests</h4>
      {pending.length === 0 && <p className="text-[12px] text-[#8a96c2]">No pending requests.</p>}
      {pending.map((request) => (
        <div key={request.id} data-testid={`broker-request-${request.id}`} className="rounded-lg border border-[#243365] p-3 space-y-2 text-[12px] text-[#a8b3d8]">
          <p>{request.agent} requests <strong>{request.operation}</strong></p>
          <p>Entry ID: <code data-testid={`broker-entry-${request.id}`}>{request.credential}</code></p>
          <p>{request.description}</p>
          <p>Expires in {Math.max(0, Math.ceil((request.expires_at - clock) / 1000))}s</p>
          <div className="flex gap-2 flex-wrap">
            <button data-testid={`broker-approve-${request.id}`} className={button} disabled={busy || request.expires_at <= clock}
              onClick={() => void act(() => approveBrokerRequest(broker, request))}>Approve with passkey</button>
            <button data-testid={`broker-deny-${request.id}`} className={button} disabled={busy}
              onClick={() => void act(() => broker.deny(request.id))}>Deny</button>
            <button data-testid={`broker-revoke-request-${request.id}`} className={button} disabled={busy}
              onClick={() => void act(() => broker.revokeRequest(request.id))}>Revoke request</button>
          </div>
        </div>
      ))}
      <h4 className="text-[12px] font-semibold text-white">Recent outcomes</h4>
      <ul data-testid="broker-outcomes" className="space-y-1 text-[12px] text-[#8a96c2]">
        {outcomes.map((request) => <li key={request.id}>{request.agent} · Entry ID: {request.credential} · {request.operation} · {request.status}{request.error ? ` (${request.error})` : ''}</li>)}
      </ul>
    </section>
  );
}
