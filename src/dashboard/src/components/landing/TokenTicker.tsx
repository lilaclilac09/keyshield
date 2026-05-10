const tokens = [
  { symbol: 'OUSG', name: 'Ondo US Gov' },
  { symbol: 'ULTRA', name: 'Ultra Protocol' },
  { symbol: 'BUIDL', name: 'BlackRock BUIDL' },
  { symbol: 'USDC', name: 'USD Coin' },
  { symbol: 'BE', name: 'Base Ecosystem' },
];

export default function TokenTicker() {
  return (
    <div className="token-ticker">
      <ul className="token-ticker__list">
        {tokens.map(({ symbol, name }) => (
          <li key={symbol} className="token-ticker__item">
            <span className="token-ticker__symbol">{symbol}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
