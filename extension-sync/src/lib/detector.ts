/**
 * KeyShield Agentic - Comprehensive API Key Detection System
 * 
 * Detects 100+ API key patterns including:
 * - AI/LLM Providers (OpenAI, Anthropic, Google Gemini, Groq, Mistral)
 * - Payment Gateways (Stripe, PayPal, Square)
 * - Cloud Providers (AWS, GCP, Azure)
 * - Solana RPC/Infra (Helius, QuickNode, Alchemy, Ankr, etc.)
 * - DeFi/Trading (0x, Uniswap, 1inch, bloXroute)
 * - Developer Tools (GitHub, GitLab, Vercel, Netlify)
 * - Communication (Twilio, SendGrid, Mailgun)
 * - And 50+ more patterns
 */

export interface DetectedKey {
  key: string;
  source: 'form' | 'clipboard' | 'ocr' | 'dom' | 'network';
  fieldName?: string;
  fieldType?: string;
  domain: string;
  timestamp: number;
  provider?: string;
  confidence: number; // 0-100
}

// ==================== PATTERN DEFINITIONS ====================

interface API_PATTERN {
  name: string;
  regex: RegExp;
  priority: number; // Higher = more important
  category: string;
  examples?: string[];
}

// Comprehensive API patterns (100+)
const API_PATTERNS: API_PATTERN[] = [
  // ===== AI/LLM PROVIDERS =====
  { name: 'OpenAI', regex: /sk-(?:live|test|proj)_[A-Za-z0-9]{48,}/i, priority: 10, category: 'AI/LLM', examples: ['sk-live-...'] },
  { name: 'Anthropic', regex: /sk-ant-api03-[A-Za-z0-9_-]{48,}/i, priority: 10, category: 'AI/LLM', examples: ['sk-ant-api03-...'] },
  { name: 'Google Gemini', regex: /AIza[0-9A-Za-z_-]{35}/i, priority: 9, category: 'AI/LLM', examples: ['AIzaSy...'] },
  { name: 'Groq', regex: /gsk_[A-Za-z0-9_-]{48,}/i, priority: 9, category: 'AI/LLM', examples: ['gsk_...'] },
  { name: 'Mistral', regex: /(?:mistral|mfx)[-_]?(?:api)?[-_]?(?:key)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 8, category: 'AI/LLM' },
  { name: 'Cohere', regex: /(?:cohere)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 8, category: 'AI/LLM' },
  { name: 'AI21', regex: /(?:ai21)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 8, category: 'AI/LLM' },
  { name: 'Replicate', regex: /r8_[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'AI/LLM' },
  { name: 'HuggingFace', regex: /hf_[A-Za-z0-9_-]{34,}/i, priority: 7, category: 'AI/LLM' },
  { name: 'TogetherAI', regex: /(?:together)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'AI/LLM' },
  { name: 'Perplexity', regex: /pplx-[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'AI/LLM' },
  { name: 'Together', regex: /tgp_[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'AI/LLM' },
  { name: 'Fireworks', regex: /(?:fireworks)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'AI/LLM' },
  { name: 'Anyscale', regex: /(?:anyscale)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'AI/LLM' },
  { name: 'Baseten', regex: /(?:baseten)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'AI/LLM' },

  // ===== SOLANA INFRASTRUCTURE =====
  { name: 'Helius', regex: /(?:api-)?key[-_]?(?:id)?[-_]?(?:=)?[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/i, priority: 10, category: 'Solana/RPC', examples: ['api-key=abc123...'] },
  { name: 'QuickNode', regex: /\.(?:quicknode\.pro|quicknode\.com)\/[a-zA-Z0-9_-]{30,}/i, priority: 9, category: 'Solana/RPC' },
  { name: 'Alchemy', regex: /\.(?:alchemy\.com|alchemyapi\.io)\/v2\/[A-Za-z0-9_-]{32,}/i, priority: 9, category: 'Solana/RPC' },
  { name: 'Ankr', regex: /(?:ankr\.com|ankr\.io)\/[A-Za-z0-9_]{40,}/i, priority: 8, category: 'Solana/RPC' },
  { name: 'GetBlock', regex: /Authorization:\s*Bearer\s+[A-Za-z0-9]{40,}/i, priority: 8, category: 'Solana/RPC' },
  { name: 'Chainstack', regex: /\.(?:chainstack\.com|chainstacklabs\.com)\/[A-Za-z0-9_-]{32,}/i, priority: 8, category: 'Solana/RPC' },
  { name: 'Triton', regex: /(?:triton|tritonbuilder|validator)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 8, category: 'Solana/RPC' },
  { name: 'GenesysGo', regex: /(?:genesysgo|shadow)[-_]?(?:cli)?[-_]?(?:token|key)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'Solana/RPC' },
  { name: 'Bitquery', regex: /(?:bitquery)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Solana/Data' },
  { name: 'SimpleHash', regex: /(?:simplehash)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'NFTs' },
  { name: 'Helius NFT', regex: /x-api-key[:=]\s*[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/i, priority: 9, category: 'Solana/NFT' },

  // ===== SOLANA DATA ANALYTICS =====
  { name: 'Shyft', regex: /x-api-key[:=]\s*[A-Za-z0-9]{32,}/i, priority: 7, category: 'Solana/Data' },
  { name: 'SolanaFM', regex: /[Xx]-[Aa][Pp][Ii]-[Kk][Ee][Yy][:=]\s*[A-Za-z0-9]{32,}/i, priority: 6, category: 'Solana/Data' },
  { name: 'Solscan', regex: /solscan[_\-]?(?:api)?[_\-]?key[_\-=]?[A-Za-z0-9_\-]{32,}/i, priority: 6, category: 'Solana/Data' },
  { name: 'SolanaChef', regex: /(?:solana-chef|sonic)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Solana/Data' },

  // ===== TRADING/MEV/DEFI =====
  { name: 'bloXroute', regex: /(?:Authorization|X-Authorization):\s*[A-Za-z0-9+/=]{80,}/i, priority: 9, category: 'Trading/MEV' },
  { name: '0x API', regex: /(?:0x-api-key|X-API-Key):\s*[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/i, priority: 8, category: 'DeFi' },
  { name: 'Uniswap', regex: /(?:uniswap|uni)[-_]?(?:api)?[-_]?(?:key|secret)[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 8, category: 'DeFi' },
  { name: '1inch', regex: /(?:1inch)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'DeFi' },
  { name: 'Dexscreener', regex: /(?:dexscreener)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'DeFi' },
  { name: 'Dexlib', regex: /(?:dexlib)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'DeFi' },
  { name: 'Birdeye', regex: /(?:birdeye)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Solana/Data' },
  { name: 'Raydium', regex: /(?:raydium)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'DeFi' },
  { name: 'Serum', regex: /(?:serum|project-serum)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'DeFi' },
  { name: 'Jupiter', regex: /(?:jupiter)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'DeFi' },
  { name: 'Orca', regex: /(?:orca)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'DeFi' },
  { name: ' marinade', regex: /(?:marinade)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'DeFi' },
  { name: 'Lido', regex: /(?:lido)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'DeFi' },
  { name: 'Mango', regex: /(?:mango)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'DeFi' },
  { name: 'Drift', regex: /(?:drift)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'DeFi' },
  { name: 'Zeta', regex: /(?:zeta)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'DeFi' },
  { name: '01', regex: /(?:zero-one|01)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'DeFi' },

  // ===== PAYMENT GATEWAYS =====
  { name: 'Stripe', regex: /[rs]k_(?:live|test)_[A-Za-z0-9]{24,}/i, priority: 9, category: 'Payments', examples: ['sk_live_...', 'rk_live_...'] },
  { name: 'Stripe Publishable', regex: /pk_(?:live|test)_[A-Za-z0-9]{24,}/i, priority: 6, category: 'Payments' },
  { name: 'Stripe Webhook', regex: /whsec_[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'Payments' },
  { name: 'PayPal', regex: /(?:paypal)[-_]?(?:client|api)?[-_]?(?:secret|key|id)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 8, category: 'Payments' },
  { name: 'Square', regex: /(?:square)[-_]?(?:access|api)?[-_]?(?:token|key|secret)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'Payments' },
  { name: 'Braintree', regex: /(?:braintree)[-_]?(?:merchant|public|private)?[-_]?(?:id|key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Payments' },
  { name: 'Paddle', regex: /(?:paddle)[-_]?(?:vendor|api)?[-_]?(?:key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Payments' },
  { name: 'Chargebee', regex: /(?:chargebee)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Payments' },
  { name: 'Recurly', regex: /(?:recurly)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Payments' },
  { name: 'Adyen', regex: /(?:adyen)[-_]?(?:api|client)?[-_]?(?:key|secret)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Payments' },

  // ===== CLOUD PROVIDERS =====
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/i, priority: 9, category: 'Cloud', examples: ['AKIA...'] },
  { name: 'AWS Secret', regex: /(?:aws|aws_secret|aws-access-key)[-_\s]*(?:secret)?[-_\s]*(?:key)?[-_\s=]*[A-Za-z0-9/+=]{40}/i, priority: 9, category: 'Cloud' },
  { name: 'AWS Session', regex: /(?:aws)[-_]?(?:session)[-_]?(?:token)?[-_=]?[A-Za-z0-9/+=]{100,}/i, priority: 7, category: 'Cloud' },
  { name: 'GCP', regex: /AIza[0-9A-Za-z_-]{35}/i, priority: 9, category: 'Cloud' },
  { name: 'GCP Service Account', regex: /(?:gcp|google)[-_]?(?:service)?[-_]?(?:account)?[-_]?(?:key|json)?[-_=]?\{[^}]+\}/i, priority: 8, category: 'Cloud' },
  { name: 'Azure', regex: /(?:azure|azure_subscription|azure_client|azure_tenant)[-_]?(?:id|key|secret)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 8, category: 'Cloud' },
  { name: 'DigitalOcean', regex: /(?:digitalocean|do)[-_]?(?:api|access)?[-_]?(?:key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'Cloud' },
  { name: 'Linode', regex: /(?:linode|linode)[-_]?(?:api|personal)?[-_]?(?:key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Cloud' },
  { name: 'Vultr', regex: /(?:vultr)[-_]?(?:api)?[-_]?key[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Cloud' },
  { name: 'Cloudflare', regex: /(?:cloudflare|cf)[-_]?(?:api|global)?[-_]?(?:key|token|secret)?[-_=]?[A-Za-z0-9a-z_-]{37,}/i, priority: 8, category: 'Cloud' },
  { name: 'Fastly', regex: /(?:fastly)[-_]?(?:api|service)?[-_]?(?:key|token|secret)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Cloud' },
  { name: 'Heroku', regex: /(?:heroku)[-_]?(?:api|auth|oauth)?[-_]?(?:key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Cloud' },
  { name: 'Render', regex: /(?:render)[-_]?(?:api|service)?[-_]?(?:key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Cloud' },
  { name: 'Fly', regex: /(?:fly)[-_]?(?:api|org)?[-_]?(?:key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Cloud' },

  // ===== DEVELOPER PLATFORMS =====
  { name: 'GitHub PAT', regex: /gh[pousr]_[A-Za-z0-9]{36,}/i, priority: 9, category: 'DevTools', examples: ['ghp_...', 'github_pat_...'] },
  { name: 'GitHub OAuth', regex: /(?:github)[-_]?(?:oauth)?[-_]?(?:access)?[-_]?(?:token|key)?[-_=]?[A-Za-z0-9_-]{36,}/i, priority: 8, category: 'DevTools' },
  { name: 'GitLab', regex: /glpat-[A-Za-z0-9_-]{20,}/i, priority: 7, category: 'DevTools' },
  { name: 'Bitbucket', regex: /(?:bitbucket)[-_]?(?:app|password|oauth)?[-_]?(?:key|secret|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'DevTools' },
  { name: 'Vercel', regex: /(?:vercel|zeabur)[-_]?(?:api|deploy|token|org)?[-_]?(?:key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 8, category: 'DevTools' },
  { name: 'Netlify', regex: /(?:netlify)[-_]?(?:api|site|access)?[-_]?(?:key|token|id)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'DevTools' },
  { name: 'Railway', regex: /(?:railway)[-_]?(?:api|project|token)?[-_]?(?:key|token|id)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'DevTools' },
  { name: 'Replit', regex: /(?:replit)[-_]?(?:api|deploy|token)?[-_]?(?:key|token|id)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'DevTools' },
  { name: 'Cursor', regex: /(?:cursor)[-_]?(?:api|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'DevTools' },
  { name: 'Windsurf', regex: /(?:windsurf)[-_]?(?:api|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'DevTools' },

  // ===== DATABASE =====
  { name: 'MongoDB', regex: /(?:mongodb|mongo)[-+]?(?:srv|atlas)?[-_]?(?:connection|uri|connection_string)?[-_=]?(?:mongodb\+srv|redis)?:\/\/[^:\s]+:[^@\s]+@/i, priority: 8, category: 'Database' },
  { name: 'Redis', regex: /(?:redis)[-_]?(?:url|connection|uri)?[-_=]?redis:\/\/[^:\s]+:[^@\s]+@/i, priority: 7, category: 'Database' },
  { name: 'PostgreSQL', regex: /(?:postgres|postgresql|pg)[-_]?(?:url|connection|uri|database)?[-_=]?postgres(ql)?:\/\/[^:\s]+:[^@\s]+@/i, priority: 7, category: 'Database' },
  { name: 'MySQL', regex: /(?:mysql)[-_]?(?:url|connection|uri|database)?[-_=]?mysql:\/\/[^:\s]+:[^@\s]+@/i, priority: 7, category: 'Database' },
  { name: 'PlanetScale', regex: /(?:planetscale|pscale)[-_]?(?:url|connection|token|api)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Database' },
  { name: 'Supabase', regex: /(?:supabase)[-_]?(?:anon|service|api|jwt|url|key)?[-_=]?(?:eyJ[A-Za-z0-9_-]{50,})/i, priority: 7, category: 'Database' },
  { name: 'Neon', regex: /(?:neon|neondb)[-_]?(?:project|endpoint|api|key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Database' },
  { name: 'CockroachDB', regex: /(?:cockroach|cockroachdb)[-_]?(?:connection|uri|sql)?[-_=]?postgres:\/\/[^:\s]+:[^@\s]+@/i, priority: 6, category: 'Database' },

  // ===== COMMUNICATION =====
  { name: 'Twilio', regex: /SK[0-9a-fA-F]{32}/i, priority: 8, category: 'Communication' },
  { name: 'Twilio Auth', regex: /(?:twilio)[-_]?(?:account|auth|api)?[-_]?(?:sid|token|key)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 8, category: 'Communication' },
  { name: 'SendGrid', regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/i, priority: 7, category: 'Communication' },
  { name: 'Mailgun', regex: /(?:mailgun|mg)[-_]?(?:api|domain|key|pub)?[-_]?(?:key|api-key)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'Communication' },
  { name: 'Postmark', regex: /(?:postmark)[-_]?(?:server|api|token)?[-_]?(?:key|token|id)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Communication' },
  { name: 'MessageBird', regex: /(?:messagebird|msgbird)[-_]?(?:api|access|key)?[-_]?(?:key|token|id)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Communication' },
  { name: 'Discord', regex: /(?:discord)[-_]?(?:bot|api|webhook|token)?[-_]?(?:key|token|secret|webhook)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'Communication' },
  { name: 'Slack', regex: /(?:slack)[-_]?(?:bot|user|api|webhook|token)?[-_]?(?:key|token|webhook|xox[baprs]-.*)/i, priority: 7, category: 'Communication' },
  { name: 'Telegram', regex: /(?:telegram)[-_]?(?:bot|api|token|key)?[-_]?(?:token|key)?[-_=]?[0-9:]{10,}/i, priority: 7, category: 'Communication' },

  // ===== STORAGE =====
  { name: 'AWS S3', regex: /(?:aws)?[-_\s]*(?:s3|bucket)?[-_\s]*(?:access|secret|key)?[-_\s=]*(?:A3T[A-Z0-9]|AKIA|ASIA)[A-Z0-9]{16}/i, priority: 8, category: 'Storage' },
  { name: 'Backblaze', regex: /(?:backblaze|b2)[-_]?(?:key|app|account)?[-_]?(?:key|id|application)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Storage' },
  { name: 'Dropbox', regex: /(?:dropbox)[-_]?(?:access|api|app|token|key)?[-_]?(?:token|key|secret)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Storage' },
  { name: 'Wasabi', regex: /(?:wasabi)[-_]?(?:access|api|key|secret)?[-_]?(?:key|secret)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Storage' },
  { name: 'R2', regex: /(?:cloudflare|r2)[-_]?(?:access|api|key|secret|account)?[-_]?(?:key|secret|token)?[-_=]?[A-Za-z0-9a-z_-]{40,}/i, priority: 6, category: 'Storage' },

  // ===== MONITORING & ANALYTICS =====
  { name: 'Datadog', regex: /(?:datadog|dd)[-_]?(?:api|app|client)?[-_]?(?:key|token|api_key)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'Monitoring' },
  { name: 'New Relic', regex: /(?:newrelic|nr)[-_]?(?:api|license|insert|admin)?[-_]?(?:key|token|license_key|api_key)?[-_=]?[A-Za-z0-9_-]{40,}/i, priority: 7, category: 'Monitoring' },
  { name: 'Sentry', regex: /(?:sentry)[-_]?(?:dsn|org|auth|token|project)?[-_]?(?:key|token|dsn)?[-_=]?https:\/\/[a-f0-9]+@[a-z0-9.]+/i, priority: 7, category: 'Monitoring' },
  { name: 'Mixpanel', regex: /(?:mixpanel)[-_]?(?:api|token|key|secret)?[-_]?(?:token|api_key|secret)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Analytics' },
  { name: 'Segment', regex: /(?:segment)[-_]?(?:write|read|api|source)?[-_]?(?:key|token|secret)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'Analytics' },
  { name: 'Amplitude', regex: /(?:amplitude)[-_]?(?:api|project|key|secret)?[-_]?(?:key|api_key|secret_key)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Analytics' },
  { name: 'Pendo', regex: /(?:pendo)[-_]?(?:api|integration|io|secret)?[-_]?(?:key|token|api_key)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Analytics' },
  { name: 'FullStory', regex: /(?:fullstory|fs)[-_]?(?:api|org|token|key)?[-_]?(?:api_key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Analytics' },
  { name: 'Hotjar', regex: /(?:hotjar)[-_]?(?:site|id|api|token)?[-_]?(?:key|token|id)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Analytics' },

  // ===== IDENTITY & AUTH =====
  { name: 'Auth0', regex: /(?:auth0|auth|jwt)[-_]?(?:domain|client|secret|api|token)?[-_]?(?:key|secret|token|audience)?[-_=]?(?:[a-zA-Z0-9-]+\.auth0\.com|[A-Za-z0-9_-]{32,})/i, priority: 8, category: 'Identity' },
  { name: 'Clerk', regex: /(?:clerk)[-_]?(?:publishable|secret|api|test)?[-_]?(?:key|token)?[-_=]?pk_[A-Za-z0-9_-]{32,}/i, priority: 8, category: 'Identity' },
  { name: 'Firebase', regex: /(?:firebase)[-_]?(?:api|project|config|service)?[-_]?(?:key|token|api_key)?[-_=]?AIza[0-9A-Za-z_-]{35}/i, priority: 8, category: 'Identity' },
  { name: 'Supabase Auth', regex: /(?:supabase)[-_]?(?:anon|service)[-_]?(?:key|secret)?[-_=]?eyJ[A-Za-z0-9_-]{50,}/i, priority: 7, category: 'Identity' },
  { name: 'Kinde', regex: /(?:kinde)[-_]?(?:client|api|domain|secret)?[-_]?(?:key|secret|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Identity' },
  { name: 'WorkOS', regex: /(?:workos)[-_]?(?:api|client|secret)?[-_]?(?:key|secret|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Identity' },

  // ===== SEARCH =====
  { name: 'Algolia', regex: /(?:algolia)[-_]?(?:application|search|admin|api)?[-_]?(?:id|key|api_key|secret)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'Search' },
  { name: 'Elasticsearch', regex: /(?:elastic|elasticsearch|es)[-_]?(?:cloud|api|username|password)?[-_]?(?:key|token|username|password)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Search' },
  { name: 'Meilisearch', regex: /(?:meilisearch|meili)[-_]?(?:api|master|public)?[-_]?(?:key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Search' },
  { name: 'Typesense', regex: /(?:typesense)[-_]?(?:api|node|cluster)?[-_]?(?:key|secret)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Search' },

  // ===== MAPS & LOCATION =====
  { name: 'Mapbox', regex: /(?:mapbox)[-_]?(?:access|api|public|secret)?[-_]?(?:token|key|pk)?[-_=]?pk\.[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'Maps' },
  { name: 'Google Maps', regex: /(?:google|gmaps|gapi)[-_]?(?:maps|geocoding|places|directions)?[-_]?(?:api|key)?[-_=]?AIza[0-9A-Za-z_-]{35}/i, priority: 7, category: 'Maps' },
  { name: 'MapTiler', regex: /(?:maptiler)[-_]?(?:api|key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Maps' },
  { name: 'Here', regex: /(?:here)[-_]?(?:api|app|platform|credentials)?[-_]?(?:key|token|access)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Maps' },

  // ===== CRYPTO & ON-CHAIN =====
  { name: 'Infura', regex: /(?:infura|alchemy)[-_]?(?:project|api|key|id|secret)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 8, category: 'Blockchain' },
  { name: 'Etherscan', regex: /(?:etherscan)[-_]?(?:api|key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'Blockchain' },
  { name: 'PolygonScan', regex: /(?:polygonscan|polygon)[-_]?(?:api|key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Blockchain' },
  { name: 'Arbiscan', regex: /(?:arbiscan|arbitrum)[-_]?(?:api|key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Blockchain' },
  { name: 'Optimism', regex: /(?:optimism|op)[-_]?(?:api|key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Blockchain' },
  { name: 'Base', regex: /(?:base)[-_]?(?:api|key|token|mainnet|sepolia)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Blockchain' },
  { name: 'CoinGecko', regex: /(?:coingecko|cg)[-_]?(?:api|key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Crypto Data' },
  { name: 'CoinMarketCap', regex: /(?:coinmarketcap|cmc)[-_]?(?:api|key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Crypto Data' },
  { name: 'Moralis', regex: /(?:moralis)[-_]?(?:api|web3|server|key)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Blockchain' },
  { name: 'QuickNode ETH', regex: /\.(?:quicknode|quicknode\.pro)\/[a-zA-Z0-9_-]{30,}/i, priority: 8, category: 'Blockchain' },
  { name: 'Tatum', regex: /(?:tatum)[-_]?(?:api|key|secret)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Blockchain' },
  { name: 'Covalent', regex: /(?:covalent)[-_]?(?:api|key|project|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Blockchain' },
  { name: 'Lit Protocol', regex: /(?:lit)[-_]?(?:access|control|network|key|token)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'Encryption' },
  { name: 'Arcium', regex: /(?:arcium|arcis)[-_]?(?:api|key|cluster|network)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 7, category: 'MPC' },

  // ===== MISCELLANEOUS =====
  { name: 'NPM Token', regex: /(?:npm)[-_]?(?:token|auth|registry)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'Package Manager' },
  { name: 'PyPI Token', regex: /(?:pypi)[-_]?(?:token|auth|project)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Package Manager' },
  { name: 'Docker Hub', regex: /(?:docker|dockerhub)[-_]?(?:access|token|username|password)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Container' },
  { name: 'Terraform', regex: /(?:terraform|tf)[-_]?(?:token|cloud|state|api|organization)?[-_]?(?:token|key|secret)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Infrastructure' },
  { name: 'Pulumi', regex: /(?:pulumi)[-_]?(?:access|cloud|api|token|secret)?[-_]?(?:token|key|secret)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 5, category: 'Infrastructure' },
  { name: 'GraphQL', regex: /(?:graphql|hasura)[-_]?(?:api|endpoint|key|admin|secret)?[-_=]?[A-Za-z0-9_-]{32,}/i, priority: 6, category: 'API' },
  { name: 'Webhook', regex: /(?:webhook|wh|hook)[-_]?(?:url|secret|token|key)?[-_=]?https?:\/\/[^\s/$.?#].[^\s]*/i, priority: 4, category: 'Webhook' },
];

// Field name patterns that likely contain API keys
const KEY_FIELD_PATTERNS = [
  // Generic patterns
  /api[_-]?key/i,
  /apikey/i,
  /api[_-]?token/i,
  /access[_-]?token/i,
  /secret[_-]?key/i,
  /secret[_-]?token/i,
  /auth[_-]?token/i,
  /bearer[_-]?token/i,
  /private[_-]?key/i,
  /public[_-]?key/i,
  /password/i,
  
  // AI/LLM Providers
  /openai/i,
  /anthropic/i,
  /gemini/i,
  /groq/i,
  /mistral/i,
  /cohere/i,
  /huggingface/i,
  /replicate/i,
  /together/i,
  /perplexity/i,
  /fireworks/i,
  
  // Solana RPC
  /helius.*api/i,
  /helius.*key/i,
  /quicknode/i,
  /alchemy/i,
  /ankr/i,
  /getblock/i,
  /chainstack/i,
  /triton/i,
  /genesysgo/i,
  
  // DeFi
  /jupiter/i,
  /raydium/i,
  /orca/i,
  /serum/i,
  /mango/i,
  /drift/i,
  /uniswap/i,
  /zero.?one/i,
  
  // Payments
  /stripe/i,
  /paypal/i,
  /square/i,
  /braintree/i,
  
  // Cloud
  /aws.*access/i,
  /aws.*secret/i,
  /gcp.*key/i,
  /azure.*key/i,
  /cloudflare/i,
  /digitalocean/i,
  
  // DevTools
  /github.*token/i,
  /gitlab.*token/i,
  /vercel/i,
  /netlify/i,
  
  // Database
  /mongodb/i,
  /redis/i,
  /postgres/i,
  /supabase/i,
  /neon/i,
  
  // Communication
  /twilio/i,
  /sendgrid/i,
  /mailgun/i,
  /slack/i,
  /discord/i,
  /telegram/i,
  
  // Monitoring
  /datadog/i,
  /newrelic/i,
  /sentry/i,
  
  // Identity
  /auth0/i,
  /clerk/i,
  /firebase/i,
  
  // Crypto
  /infura/i,
  /etherscan/i,
  /moralis/i,
  /coingecko/i,
];

// Domain whitelist for auto-detection
const TRUSTED_DOMAINS = [
  // AI/LLM
  'openai.com', 'anthropic.com', 'claude.ai', 'google.com', 'groq.com', 
  'mistral.ai', 'cohere.com', 'replicate.com', 'huggingface.co', 'together.ai',
  'perplexity.ai', 'fireworks.ai', 'anyscale.com', 'baseten.co',
  
  // Solana/Blockchain
  'helius.dev', 'helius.xyz', 'quicknode.com', 'quicknode.pro', 'alchemy.com',
  'alchemyapi.io', 'ankr.com', 'ankr.io', 'getblock.io', 'chainstack.com',
  'triton.build', 'genesysgo.xyz', 'shyft.to', 'solana.fm', 'solscan.io',
  'birdeye.so', 'jup.ag', 'raydium.io', 'orca.so', 'mango.markets',
  'drift.trade', 'uniswap.org', '01.ai', 'marginfi.com', 'friktion.fi',
  
  // Payments
  'stripe.com', 'paypal.com', 'squareup.com', 'braintreepayments.com',
  
  // Cloud
  'aws.amazon.com', 'console.aws.amazon.com', 'cloud.google.com', 'azure.microsoft.com',
  'digitalocean.com', 'linode.com', 'vultr.com', 'cloudflare.com', 'fastly.com',
  'heroku.com', 'render.com', 'railway.app', 'fly.io',
  
  // DevTools
  'github.com', 'gitlab.com', 'bitbucket.org', 'vercel.com', 'netlify.com',
  
  // Database
  'mongodb.com', 'mongodb.net', 'redis.io', 'postgresql.org', 'planetscale.com',
  'supabase.co', 'neon.tech', 'cockroachlabs.com',
  
  // Communication
  'twilio.com', 'sendgrid.com', 'mailgun.org', 'postmarkapp.com',
  'discord.com', 'slack.com', 'telegram.org',
  
  // Identity
  'auth0.com', 'clerk.com', 'firebase.google.com', 'kinde.ai', 'workos.com',
  
  // Search
  'algolia.com', 'elastic.co', 'meilisearch.com', 'typesense.org',
  
  // Maps
  'mapbox.com', 'maps.google.com', 'maptiler.com', 'here.com',
  
  // Analytics
  'datadoghq.com', 'newrelic.com', 'sentry.io', 'mixpanel.com',
  'segment.com', 'amplitude.com', 'pendo.io', 'fullstory.com', 'hotjar.com',
];

// ==================== DETECTION ENGINE ====================

export class KeyDetector {
  /**
   * Detect API keys in form fields
   */
  static detectFormFields(): DetectedKey[] {
    const detected: DetectedKey[] = [];
    const domain = window.location.hostname;
    
    // Skip untrusted domains unless explicitly detected
    const isTrustedDomain = TRUSTED_DOMAINS.some(d => domain.includes(d));
    
    const inputs = document.querySelectorAll<HTMLInputElement>(
      'input[type="text"], input[type="password"], input:not([type]), textarea, input[type="email"]'
    );

    inputs.forEach((input) => {
      const value = input.value.trim();
      if (!value || value.length < 10) return;

      const fieldName = input.name || input.id || input.className || '';
      const isKeyField = KEY_FIELD_PATTERNS.some(pattern => pattern.test(fieldName));

      // Check if value matches key patterns
      for (const pattern of API_PATTERNS) {
        const match = value.match(pattern.regex);
        if (match) {
          const confidence = this.calculateConfidence(pattern, isKeyField, isTrustedDomain);
          detected.push({
            key: match[1] || match[0],
            source: 'form',
            fieldName,
            fieldType: input.type || 'text',
            domain,
            timestamp: Date.now(),
            provider: pattern.name,
            confidence,
          });
          break;
        }
      }

      // Fallback: if no pattern matched but field name suggests API key
      if (isKeyField && value.length >= 16 && !detected.find(d => d.fieldName === fieldName)) {
        detected.push({
          key: value,
          source: 'form',
          fieldName,
          fieldType: input.type || 'text',
          domain,
          timestamp: Date.now(),
          confidence: 30, // Low confidence for fallback
        });
      }
    });

    return detected;
  }

  /**
   * Detect key from clipboard content
   */
  static async detectClipboard(): Promise<DetectedKey | null> {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.length < 10) return null;

      const trimmed = text.trim();

      // Check if clipboard content matches key patterns
      for (const pattern of API_PATTERNS) {
        const match = trimmed.match(pattern.regex);
        if (match) {
          return {
            key: match[1] || match[0],
            source: 'clipboard',
            domain: window.location.hostname,
            timestamp: Date.now(),
            provider: pattern.name,
            confidence: 80,
          };
        }
      }

      // Check for keys in multi-line content (e.g., .env files)
      const lines = trimmed.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*[A-Z_]+[=:]\s*(.+)$/);
        if (match) {
          const value = match[1].trim().replace(/['"]/g, '');
          for (const pattern of API_PATTERNS) {
            const keyMatch = value.match(pattern.regex);
            if (keyMatch) {
              return {
                key: keyMatch[1] || keyMatch[0],
                source: 'clipboard',
                domain: window.location.hostname,
                timestamp: Date.now(),
                provider: pattern.name,
                confidence: 70,
              };
            }
          }
        }
      }
    } catch (error) {
      console.warn('[KeyShield] Clipboard access denied:', error);
    }

    return null;
  }

  /**
   * Detect keys from text content (for OCR)
   */
  static detectFromText(text: string, domain: string): DetectedKey[] {
    const detected: DetectedKey[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 10) continue;

      // Check direct pattern matches
      for (const pattern of API_PATTERNS) {
        const match = trimmed.match(pattern.regex);
        if (match) {
          detected.push({
            key: match[1] || match[0],
            source: 'ocr',
            domain,
            timestamp: Date.now(),
            provider: pattern.name,
            confidence: 75,
          });
          break;
        }
      }

      // Check for key=value patterns
      const keyValueMatch = trimmed.match(/^\s*[A-Z_]+[=:]\s*(.+)$/);
      if (keyValueMatch) {
        const value = keyValueMatch[1].trim().replace(/['"]/g, '');
        for (const pattern of API_PATTERNS) {
          const match = value.match(pattern.regex);
          if (match) {
            detected.push({
              key: match[1] || match[0],
              source: 'ocr',
              domain,
              timestamp: Date.now(),
              provider: pattern.name,
              confidence: 65,
            });
            break;
          }
        }
      }
    }

    return detected;
  }

  /**
   * Detect keys from DOM content
   */
  static detectFromDOMContent(): DetectedKey[] {
    const detected: DetectedKey[] = [];
    const domain = window.location.hostname;
    const alerted = new Set<string>();

    try {
      const textContent = document.body?.innerText || '';
      const htmlContent = document.body?.innerHTML || '';
      const combinedContent = textContent + '\n' + htmlContent;

      for (const pattern of API_PATTERNS) {
        const matches = [...combinedContent.matchAll(new RegExp(pattern.regex.source, 'gi'))];
        
        for (const match of matches) {
          const key = match[1] || match[0];
          if (!key || key.length < 10) continue;

          const keyId = `${pattern.name}:${key.slice(0, 12)}`;
          
          if (!alerted.has(keyId)) {
            alerted.add(keyId);
            
            detected.push({
              key: key.trim(),
              source: 'dom',
              domain,
              timestamp: Date.now(),
              provider: pattern.name,
              confidence: 60,
            });
          }
        }
      }
    } catch (error) {
      console.warn('[KeyShield] Error scanning DOM content:', error);
    }

    return detected;
  }

  /**
   * Calculate confidence score
   */
  private static calculateConfidence(pattern: API_PATTERN, isKeyField: boolean, isTrustedDomain: boolean): number {
    let confidence = 50; // Base

    // Priority contribution (0-30)
    confidence += Math.min(pattern.priority * 3, 30);

    // Field name match (+15)
    if (isKeyField) confidence += 15;

    // Trusted domain (+10)
    if (isTrustedDomain) confidence += 10;

    // Pattern examples exist (+5)
    if (pattern.examples) confidence += 5;

    return Math.min(confidence, 100);
  }

  /**
   * Validate if a string is likely an API key
   */
  static isValidKey(key: string): boolean {
    if (!key || key.length < 10) return false;
    return API_PATTERNS.some(pattern => pattern.regex.test(key.trim()));
  }

  /**
   * Get all patterns for reference
   */
  static getAllPatterns(): API_PATTERN[] {
    return [...API_PATTERNS];
  }

  /**
   * Get trusted domains
   */
  static getTrustedDomains(): string[] {
    return [...TRUSTED_DOMAINS];
  }

  /**
   * Watch the page for newly-added inputs and re-run detectFormFields
   * whenever the DOM changes. Returns a teardown function that
   * disconnects the observer.
   *
   * Used by content.ts to react to SPA navigation and dynamically
   * mounted forms (e.g. modal dialogs that mount on click).
   */
  static setupFormMonitoring(
    onDetect: (keys: DetectedKey[]) => void,
  ): () => void {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
      // Node / SSR — no-op teardown.
      return () => {};
    }
    const fire = () => {
      try {
        const keys = this.detectFormFields();
        if (keys.length > 0) onDetect(keys);
      } catch (err) {
        console.warn('[KeyShield] setupFormMonitoring error:', err);
      }
    };
    fire();
    const observer = new MutationObserver(() => fire());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['value'],
    });
    return () => observer.disconnect();
  }
}

export default KeyDetector;
