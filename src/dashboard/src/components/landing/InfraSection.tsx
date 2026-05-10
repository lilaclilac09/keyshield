const infrastructureFeatures = [
  ["Policy Controls", "Rules for high-value agent transactions"],
  ["SecureKey", "Decentralized smart-wallet custody"],
  ["Risk Engine", "Real-time anomaly protection"],
];

function ShieldLogo({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 80 96" fill="none" aria-hidden="true">
      <path d="M40 4L72 16V43C72 64 57 81 40 91C23 81 8 64 8 43V16L40 4Z" stroke="white" strokeWidth="8" />
      <path d="M40 31V72" stroke="white" strokeWidth="8" strokeLinecap="round" />
      <circle cx="40" cy="27" r="10" stroke="white" strokeWidth="7" />
    </svg>
  );
}

function StackVisual() {
  return (
    <div className="stack" aria-hidden="true">
      <div className="stackGlow" />
      {["s4", "s3", "s2", "s1"].map((layer, i) => (
        <div key={layer} className={`slab ${layer}`}>
          <span className="slabTop" />
          <span className="slabSideRight" />
          <span className="slabSideFront" />
          <span className="slabGrid" />
          <span className="slabEdge" />
          {i === 3 && <ShieldLogo className="miniShield" />}
        </div>
      ))}
    </div>
  );
}

export default function InfraSection() {
  return (
    <section className="mega">
      <div className="megaText">
        <div className="sectionTiny">Built for the new era</div>
        <h2>Infrastructure for<br />Autonomous Finance</h2>
        <p>Agents are transacting, managing, and operating 24/7. KeyShield powers secure governance so they never behave with omnimode or move beyond their mission.</p>
      </div>
      <StackVisual />
      <div className="benefits">
        {infrastructureFeatures.map(([t, d]) => (
          <div key={t} className="benefit">
            <span className="dot" />
            <div><b>{t}</b><span>{d}</span></div>
          </div>
        ))}
      </div>
    </section>
  );
}
