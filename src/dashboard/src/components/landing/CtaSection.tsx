import { Link } from 'react-router';

export default function CtaSection() {
  return (
    <section className="cta">
      <h2>Ready to build the future?</h2>
      <p>Join the builders, innovators, and institutions securing the agentic economy with KeyShield.</p>
      <div className="actions">
        <Link to="/app" className="btn btnLight">Launch App <span>→</span></Link>
        <a href="#solutions" className="btn btnDark">Start Building <span>→</span></a>
      </div>
    </section>
  );
}
