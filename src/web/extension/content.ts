/**
 * KeyShield Content Script — Plasmo entry point
 *
 * Migrated from frontend/content.js.  Plasmo treats `content.ts` at the
 * package root as the MV3 content script injected into every page.
 *
 * Watches every page for exposed API keys and shows a one-click "Save to vault"
 * notification. Domain-aware: when you're on platform.openai.com, OpenAI keys
 * get the highest priority match; the same pattern would be ignored if found on
 * a random blog (avoids false positives from tutorial code).
 *
 * Maps detected provider → KeyShield backend `upstream` so a single click
 * stores the key under the correct vault namespace.
 */

export {}  // Plasmo requires this to treat the file as a module

// ── Provider definitions ────────────────────────────────────────────────────
//
// Each provider has:
//   id              — KeyShield backend upstream name (must match server UPSTREAMS)
//   name            — human label
//   label           — 3-letter badge for the in-page toast
//   patterns        — list of regex (multiple to cover variants)
//   domains         — hostnames where this key is most likely (priority boost)
//   minLen          — sanity floor
//   requiresDomain  — never trigger off-domain (high false-positive patterns)

interface Provider {
  id:             string
  name:           string
  label:          string
  patterns:       RegExp[]
  domains:        string[]
  minLen:         number
  requiresDomain?: boolean
}

const PROVIDERS: Provider[] = [
  {
    id:       "openai",
    name:     "OpenAI",
    label:    "AI",
    patterns: [
      /sk-proj-[A-Za-z0-9_-]{20,}/g,       // new-format project key
      /sk-svcacct-[A-Za-z0-9_-]{20,}/g,     // service account
      /sk-admin-[A-Za-z0-9_-]{20,}/g,       // admin key
      /sk-[A-Za-z0-9]{40,}/g,               // legacy 48+ char
    ],
    domains:  ["platform.openai.com", "openai.com"],
    minLen:   30,
  },
  {
    id:       "anthropic",
    name:     "Anthropic Claude",
    label:    "AI",
    patterns: [/sk-ant-api\d{2}-[A-Za-z0-9_-]{50,}/g],
    domains:  ["console.anthropic.com", "anthropic.com"],
    minLen:   60,
  },
  {
    id:       "groq",
    name:     "Groq",
    label:    "AI",
    patterns: [/gsk_[A-Za-z0-9]{40,}/g],
    domains:  ["console.groq.com", "groq.com"],
    minLen:   40,
  },
  {
    id:       "mistral",
    name:     "Mistral AI",
    label:    "AI",
    patterns: [/[A-Za-z0-9]{32}/g],
    domains:  ["console.mistral.ai", "mistral.ai"],
    minLen:   32,
    requiresDomain: true,
  },
  {
    id:       "cohere",
    name:     "Cohere",
    label:    "AI",
    patterns: [/[A-Za-z0-9]{40}/g],
    domains:  ["dashboard.cohere.com", "cohere.com", "cohere.ai"],
    minLen:   40,
    requiresDomain: true,
  },
  {
    id:       "helius",
    name:     "Helius RPC",
    label:    "SOL",
    patterns: [
      /helius_auth_[A-Za-z0-9]{20,}/g,
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    ],
    domains:  ["dashboard.helius.dev", "helius.dev", "helius.xyz"],
    minLen:   20,
    requiresDomain: true,
  },
  {
    id:       "0x",
    name:     "0x Protocol",
    label:    "DEX",
    patterns: [/[A-Za-z0-9-]{36}/g],
    domains:  ["dashboard.0x.org", "0x.org"],
    minLen:   36,
    requiresDomain: true,
  },
  {
    id:       "alchemy",
    name:     "Alchemy",
    label:    "RPC",
    patterns: [/[A-Za-z0-9_-]{32}/g],
    domains:  ["dashboard.alchemy.com", "alchemy.com"],
    minLen:   32,
    requiresDomain: true,
  },
]

// ── State ───────────────────────────────────────────────────────────────────

const detectedKeys = new Set<string>()
let notificationActive = false
const HOST = window.location.hostname

function isOnDomain(provider: Provider): boolean {
  return provider.domains.some(d => HOST === d || HOST.endsWith("." + d))
}

// ── Scanner ─────────────────────────────────────────────────────────────────

function scan(): void {
  const text = document.body?.innerText || ""
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLElement>(
      "input, textarea, code, pre"
    )
  )

  for (const provider of PROVIDERS) {
    const onDomain = isOnDomain(provider)
    if (provider.requiresDomain && !onDomain) continue

    for (const regex of provider.patterns) {
      regex.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = regex.exec(text)) !== null) {
        if (m[0].length >= provider.minLen) handleMatch(m[0], provider, onDomain)
      }
      for (const el of inputs) {
        const v = ((el as HTMLInputElement).value || el.textContent || "")
        regex.lastIndex = 0
        const im = regex.exec(v)
        if (im && im[0].length >= provider.minLen) handleMatch(im[0], provider, onDomain)
      }
    }
  }
}

function handleMatch(key: string, provider: Provider, onDomain: boolean): void {
  if (detectedKeys.has(key)) return
  detectedKeys.add(key)
  console.log(`[KeyShield] detected ${provider.name} key on ${HOST} (onDomain=${onDomain})`)
  showNotification(key, provider, onDomain)
}

// ── Notification UI ─────────────────────────────────────────────────────────

function showNotification(key: string, provider: Provider, onDomain: boolean): void {
  if (notificationActive) return
  notificationActive = true

  const container = document.createElement("div")
  container.id = "keyshield-detection-notice"
  Object.assign(container.style, {
    position:        "fixed",
    top:             "20px",
    right:           "20px",
    zIndex:          "999999",
    backgroundColor: "#0a0d1a",
    border:          "1px solid #1c2238",
    borderRadius:    "12px",
    padding:         "16px",
    width:           "320px",
    boxShadow:       "0 20px 40px -10px rgba(0,0,0,0.6)",
    color:           "#e4e4e7",
    fontFamily:      "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    display:         "flex",
    flexDirection:   "column",
    gap:             "12px",
    animation:       "keyshield-slide 0.18s ease-out",
  })

  if (!document.getElementById("keyshield-style")) {
    const style = document.createElement("style")
    style.id = "keyshield-style"
    style.textContent = `
      @keyframes keyshield-slide {
        from { transform: translateY(-12px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      .ks-btn{cursor:pointer;border:1px solid transparent;border-radius:8px;
        padding:9px 12px;font-size:12px;font-weight:500;transition:all .15s}
      .ks-btn-primary{background:#5b8cff;color:white;border-color:#5b8cff}
      .ks-btn-primary:hover{background:#7aa1ff}
      .ks-btn-ghost{background:transparent;color:#71717a;border-color:#27272a}
      .ks-btn-ghost:hover{color:#fafafa;border-color:#3f3f46}
      .ks-conf{display:inline-flex;align-items:center;gap:4px;font-size:10px;
        padding:2px 6px;border-radius:4px;font-weight:600}
      .ks-conf-high{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.3)}
      .ks-conf-med{background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.3)}
    `
    document.head.appendChild(style)
  }

  const conf = onDomain ? "high" : "med"
  const confText = onDomain
    ? `HIGH confidence — you are on ${HOST}`
    : `Detected, please verify provider`

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px">
      <div style="background:#0e1430;padding:6px 8px;border-radius:6px;
                  font-size:10px;font-weight:700;color:#5b8cff;
                  border:1px solid #1c2550;letter-spacing:.05em">${provider.label}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600">API key detected</div>
        <div style="color:#a1a1aa;font-size:11px;margin-top:2px">${provider.name} · ${HOST}</div>
      </div>
      <span class="ks-conf ks-conf-${conf}">${onDomain ? "✓ MATCH" : "? CHECK"}</span>
    </div>
    <div style="background:#020408;padding:10px 12px;border-radius:6px;
                font-family:'JetBrains Mono',monospace;font-size:11px;
                color:#86efac;border:1px solid #131929;
                overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
      ${key.substring(0, 14)}••••••••${key.substring(key.length - 4)}
    </div>
    <div style="font-size:10px;color:#71717a;line-height:1.5">
      ${confText}
    </div>
    <div style="display:flex;gap:8px">
      <button id="ks-save"   class="ks-btn ks-btn-primary" style="flex:1">
        Save to vault as <strong>${provider.id}</strong>
      </button>
      <button id="ks-ignore" class="ks-btn ks-btn-ghost">Dismiss</button>
    </div>
  `

  document.body.appendChild(container)

  const dismiss = (): void => {
    container.remove()
    notificationActive = false
  }

  const saveBtn = container.querySelector<HTMLButtonElement>("#ks-save")
  if (saveBtn) {
    saveBtn.onclick = (): void => {
      chrome.runtime.sendMessage({
        type:    "SAVE_KEY",
        payload: {
          upstream: provider.id,
          name:     `${provider.name} (${HOST})`,
          value:    key,
          domain:   HOST,
        },
      })
      dismiss()
    }
  }

  const ignoreBtn = container.querySelector<HTMLButtonElement>("#ks-ignore")
  if (ignoreBtn) {
    ignoreBtn.onclick = dismiss
  }

  setTimeout(() => {
    if (container.parentNode) dismiss()
  }, 12000)
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

scan()
setInterval(scan, 3000)

const observer = new MutationObserver(() => scan())
observer.observe(document.body, { childList: true, subtree: true })

// User pressed copy on a page — likely just copied a key. Re-scan.
document.addEventListener("copy", () => setTimeout(scan, 300))

// User typed/pasted in a field — likely revealing a key.
document.addEventListener("input", () => setTimeout(scan, 300), { capture: true })
