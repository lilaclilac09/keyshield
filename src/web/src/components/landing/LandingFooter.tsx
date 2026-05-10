const footerGroups = [
  ["Solutions", ["For Enterprises", "For Developers", "For AI agents"]],
  ["Technology", ["Security", "MPC-driven", "Infrastructure"]],
  ["Developers", ["Docs", "API Library", "SDKs"]],
  ["Company", ["About Us", "Careers", "Contact"]],
  ["Legal", ["Privacy Policy", "Terms Service", "Security"]],
];

function Brand() {
  return (
    <a className="brand" href="#">
      <span className="brandMark" />
      <span>KEYSHIELD<small>for autonomous finance</small></span>
    </a>
  );
}

export default function LandingFooter() {
  return (
    <>
      <footer className="footer">
        <div className="footerBrand"><Brand /></div>
        {footerGroups.map(([t, links]) => (
          <div key={t} className="fcol">
            <b>{t}</b>
            {links.map((x) => <span key={x}>{x}</span>)}
          </div>
        ))}
      </footer>
      <div className="copy">&copy; 2026 KeyShield. All rights reserved.</div>
    </>
  );
}
