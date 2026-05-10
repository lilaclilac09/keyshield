const footerGroups: Array<{ title: string; links: string[] }> = [
  { title: "Solutions", links: ["For Enterprises", "For Developers", "For AI agents"] },
  { title: "Technology", links: ["Security", "MPC-driven", "Infrastructure"] },
  { title: "Developers", links: ["Docs", "API Library", "SDKs"] },
  { title: "Company", links: ["About Us", "Careers", "Contact"] },
  { title: "Legal", links: ["Privacy Policy", "Terms Service", "Security"] },
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
        {footerGroups.map(({ title, links }) => (
          <div key={title} className="fcol">
            <b>{title}</b>
            {links.map((x) => <span key={x}>{x}</span>)}
          </div>
        ))}
      </footer>
      <div className="copy">&copy; 2026 KeyShield. All rights reserved.</div>
    </>
  );
}
