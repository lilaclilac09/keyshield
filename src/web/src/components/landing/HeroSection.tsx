import { useState, useEffect } from 'react';

const slogans = [
  ["Agents Build.", "Value Foundations."],
  ["Agents Measure.", "Value Ascends."],
  ["Agents Raise.", "Value Eternal."],
];

const trustedLogos = ["ØUSG", "◈ ULTRA", "BUILD", "USDC", "BE"];

const heroBadges = [
  ["Agentic", "Ready", "badgeA"],
  ["MCP", "Wallet", "badgeB"],
  ["Enterprise", "Custody", "badgeC"],
  ["Policy", "Engine", "badgeD"],
];

function TypingHeading() {
  const [l1, setL1] = useState("");
  const [l2, setL2] = useState("");
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let idx = 0;
    let ci = 0;
    let cj = 0;

    const type = () => {
      if (cancelled) return;
      const s = slogans[idx];

      if (ci < s[0].length) {
        ci++;
        setL1(s[0].slice(0, ci));
        setCursor(0);
        return setTimeout(type, 33);
      }
      if (cj < s[1].length) {
        cj++;
        setL2(s[1].slice(0, cj));
        setCursor(1);
        return setTimeout(type, 33);
      }

      setCursor(-1);
      setTimeout(() => {
        if (cancelled) return;
        idx = (idx + 1) % slogans.length;
        ci = 0;
        cj = 0;
        setL1("");
        setL2("");
        type();
      }, 2000);
    };

    const id = setTimeout(type, 200);
    return () => { cancelled = true; clearTimeout(id); };
  }, []);

  return (
    <h1 className="typing-head">
      <span className="typed-line">
        <span className="typed-bracket">&lt;</span>
        {l1}
        {cursor === 0 && <span className="cursor" />}
        <span className="typed-bracket">&gt;</span>
      </span>
      <span className="typed-line">
        <span className="typed-bracket">&lt;</span>
        {l2}
        {cursor === 1 && <span className="cursor" />}
        <span className="typed-bracket">&gt;</span>
      </span>
    </h1>
  );
}

function HeroGraphic() {
  return (
    <div className="orbital" aria-hidden="true">
      <div className="dots" />
      <div className="halo" />
      <div className="halo haloTwo" />
      <div className="halo haloThree" />
      <div className="crossV" />
      <div className="crossH" />
      <div className="shieldMain">
        <img src="/keyshield.svg" alt="" />
      </div>
      {heroBadges.map(([a, b, cls]) => (
        <div key={cls} className={`heroBadge ${cls}`}>
          <span>{a}</span><span>{b}</span>
        </div>
      ))}
    </div>
  );
}

function TrustedMarquee() {
  const list = [...trustedLogos, ...trustedLogos, ...trustedLogos, ...trustedLogos];
  return (
    <div className="trusted">
      <div className="trustedTitle">Trusted by innovators</div>
      <div className="marquee">
        <div className="logos">
          {list.map((logo, i) => (
            <span key={`${logo}-${i}`}>
              {["USDC", "BE"].includes(logo) && <i className="circleLogo" />}
              {logo}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HeroSection() {
  return (
    <section className="hero">
      <div className="heroText">
        <TypingHeading />
        <p>KeyShield is the intelligent agent and custodial platform built by the agentic future.</p>
        <div className="actions">
          <a href="/app" className="btn btnLight">Launch App <span>→</span></a>
          <a href="#solutions" className="btn btnDark">Build with KeyShield <span>→</span></a>
        </div>
        <TrustedMarquee />
      </div>
      <HeroGraphic />
    </section>
  );
}
