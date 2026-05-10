const securityItems = [
  ["MPC Technology", "Secure keyless management of future.", "shield"],
  ["Global Compliance", "Secure multi-regulated rapid company markets.", "check"],
  ["Tamperproof Operations", "Deploy, controls, and your data by design.", "grid"],
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

export default function SecuritySection() {
  return (
    <article className="security">
      <div className="sectionTiny">Built on trust</div>
      <h3>Security is Our<br />Foundation</h3>
      <p>KeyShield has the intelligent cryptography, identity, leading infrastructure, and action protection to protect what matters most.</p>
      <div className="checks">
        {securityItems.map(([t, d, icon]) => (
          <div key={t} className="check">
            <Icon type={icon} />
            <div><b>{t}</b><span>{d}</span></div>
          </div>
        ))}
      </div>
      <a className="learn">Learn More <span>→</span></a>
    </article>
  );
}
