const platformCards = [
  ["Agentic Ready", "Purpose built for AI Agents to transact financial securely and autonomously.", "brain"],
  ["MCP Wallet", "The first wallet built for Model Context Protocol in MCP environments.", "cube"],
  ["Enterprise Custody", "Policy, fraud-grade custody with MPC security and compliance at the core.", "shield"],
  ["Developer First", "APIs and SDKs that make it simple to build policies, approvals notifications.", "code"],
];

const iconPaths: Record<string, string[]> = {
  brain: ["M8 4c-2 1-3 3-3 6v4c0 3 2 5 5 6M16 4c2 1 3 3 3 6v4c0 3-2 5-5 6M8 9h8M8 15h8"],
  cube: ["M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z", "M12 12l8-4.5M12 12L4 7.5M12 12v9"],
  shield: ["M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z"],
  check: ["M9 12l2 2 4-5"],
  code: ["M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"],
  grid: ["M4 7h16M7 4v16M17 4v16M4 17h16"],
};

function Icon({ type }: { type: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      {type === "check" && <circle cx="12" cy="12" r="8" />}
      {(iconPaths[type] || iconPaths.grid).map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

export default function PlatformSection() {
  return (
    <section className="poss">
      <div className="eyebrow">Progress awaits you</div>
      <h3>One Platform. Endless Possibilities.</h3>
      <div className="cards">
        {platformCards.map(([t, d, icon]) => (
          <article key={t} className="card">
            <div className="icon"><Icon type={icon} /></div>
            <h4>{t}</h4>
            <p>{d}</p>
            <span className="miniArrow">→</span>
          </article>
        ))}
      </div>
    </section>
  );
}
