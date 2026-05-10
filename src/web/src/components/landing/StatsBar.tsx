const stats = [
  ["$8M", "Seed Funding from top investors, Prisma VC and other global investors."],
  ["174M", "Wallet Addresses"],
  ["3B", "Total Issued"],
  ["1.5M", "Community Actions"],
  ["Partnered", "with 20+ figure technology including a $1.5B fintech exchange platform"],
];

export default function StatsBar() {
  return (
    <section className="stats">
      {stats.map(([v, l], i) => (
        <div key={v} className={`stat ${i === 0 ? "statFeatured" : ""}`}>
          <strong className={v === "Partnered" ? "partner" : ""}>{v}</strong>
          <span className={v === "Partnered" ? "partnerText" : ""}>{l}</span>
        </div>
      ))}
    </section>
  );
}
