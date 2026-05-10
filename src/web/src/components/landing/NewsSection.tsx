import React from "react";

const capabilityItems = [
  ["Chain-Agnostic", "MPC Custody Layer", "Secure key orchestration across wallets, chains, agents, and enterprise rails.", "MPC / Multi-chain", "orbit"],
  ["Agentic Payments", "x402 Payment Ready", "Native payment authorization for AI agents, APIs, services, and autonomous workflows.", "x402 / Agent Pay", "network"],
  ["Policy-Native", "Programmable Trust Engine", "Rules, approvals, limits, and risk controls before every autonomous transaction.", "Policy / Risk", "pulse"],
];

function MotionGraphic({ variant }: { variant: string }) {
  const sets: Record<string, React.ReactNode[]> = {
    orbit: [
      <circle className="floatShape floatA shapeOuter" cx="18" cy="20" r="8.3" />,
      <polygon className="floatShape floatB shapeInner" points="42,8 50.66,23 33.34,23" />,
      <rect className="floatShape floatC shapeAccent" x="26" y="7" width="8" height="8" />,
    ],
    network: [
      <rect className="floatShape floatA shapeOuter" x="9" y="8" width="13" height="13" />,
      <circle className="floatShape floatB shapeInner" cx="39" cy="20" r="7.8" />,
      <polygon className="floatShape floatC shapeAccent" points="27,7 34.8,20.5 19.2,20.5" />,
    ],
    pulse: [
      <polygon className="floatShape floatA shapeOuter" points="17,8 26.53,24.5 7.47,24.5" />,
      <rect className="floatShape floatC shapeInner" x="36" y="12" width="10.5" height="10.5" />,
      <circle className="floatShape floatB shapeAccent" cx="32" cy="25" r="4.7" />,
    ],
  };
  return (
    <svg className="motionSvg floatingShapes" viewBox="0 0 60 36" fill="none" aria-hidden="true">
      {(sets[variant] || sets.orbit).map((el, i) =>
        React.cloneElement(el as React.ReactElement<React.SVGProps<SVGElement>>, {
          key: i,
          stroke: "white",
          fill: "none",
          strokeWidth: i === 1 ? 1.45 : 1.2,
          opacity: i === 1 ? 0.9 : i === 0 ? 0.5 : 0.34,
        })
      )}
    </svg>
  );
}

export default function NewsSection() {
  return (
    <article className="news">
      <div className="newsHead">
        <div className="sectionTiny">Capability Stack</div>
        <span>Explore capabilities →</span>
      </div>
      {capabilityItems.map(([cat, title, desc, tag, variant]) => (
        <article key={title} className="newsItem">
          <div className="thumb">
            <MotionGraphic variant={variant as string} />
          </div>
          <div className="newsText">
            <em>{cat}</em>
            <b>{title}</b>
            <span>{desc}</span>
            <small>{tag}</small>
          </div>
        </article>
      ))}
    </article>
  );
}
