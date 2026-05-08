/**
 * KeyShield Background Service Worker — Plasmo entry point
 *
 * Migrated from frontend/background.js.  Plasmo treats `background.ts` at the
 * package root as the MV3 service worker; it is bundled separately from the popup.
 *
 * Two message paths:
 *
 *  1. SAVE_KEY (from content.ts):
 *     - If a stored session token exists → POST /manage/store directly.
 *       User sees a "✓ Saved" Chrome notification. NO new tab is opened.
 *     - If no token → fall back to opening the dashboard with prefilled URL params.
 *
 *  2. KS_TOKEN_REGISTER / KS_TOKEN_CLEAR / KS_PING (from dashboard via externally_connectable):
 *     Persist or clear the session token in chrome.storage.local.
 */

export {}  // make TypeScript treat this as a module (Plasmo requires it)

const KS_BASE       = "http://localhost:8000"
const DASHBOARD_URL = "http://localhost:3000"

// ── Storage helpers ─────────────────────────────────────────────────────────

async function getStoredToken(): Promise<{ token: string | null; user: string | null }> {
  const { ks_token, ks_user } = await chrome.storage.local.get(["ks_token", "ks_user"])
  return { token: ks_token || null, user: ks_user || null }
}

async function setStoredToken(token: string, user: string | null): Promise<void> {
  await chrome.storage.local.set({ ks_token: token, ks_user: user || null })
}

async function clearStoredToken(): Promise<void> {
  await chrome.storage.local.remove(["ks_token", "ks_user"])
}

// ── Notifications ───────────────────────────────────────────────────────────

function notify(title: string, message: string, icon?: string): void {
  chrome.notifications.create(
    {
      type:    "basic",
      iconUrl: icon || chrome.runtime.getURL("assets/icon.png"),
      title,
      message,
    },
    () => {
      // Silently swallow "icon not found" — manifest icon is optional in dev.
      if (chrome.runtime.lastError) {
        console.log("[KeyShield] notify:", chrome.runtime.lastError.message)
      }
    }
  )
}

// ── Direct store (no tab) ───────────────────────────────────────────────────

interface DirectStoreResult {
  ok: boolean
  reason?: string
  detail?: string
}

async function directStore({
  upstream,
  value,
}: {
  upstream: string
  value: string
}): Promise<DirectStoreResult> {
  const { token } = await getStoredToken()
  if (!token) return { ok: false, reason: "no-token" }

  try {
    const r = await fetch(`${KS_BASE}/manage/store`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ upstream, apiKey: value }),
    })

    if (r.status === 401) {
      await clearStoredToken()
      return { ok: false, reason: "token-expired" }
    }
    if (!r.ok) {
      return { ok: false, reason: `http-${r.status}`, detail: await r.text() }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: "network", detail: String(e) }
  }
}

// ── SAVE_KEY (from content.ts) ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "SAVE_KEY") return false

  ;(async () => {
    const { upstream, name, value, domain } = message.payload as {
      upstream: string
      name: string
      value: string
      domain: string
    }

    const result = await directStore({ upstream, value })

    if (result.ok) {
      notify("✓ Key saved to vault", `${upstream} key from ${domain}`)
      sendResponse({ ok: true, mode: "direct" })
      return
    }

    const reasonMsg: Record<string, string> = {
      "no-token":      "Sign in to KeyShield first",
      "token-expired": "Session expired — sign in again",
      "network":       "Backend unreachable — opening dashboard",
    }
    const msg = reasonMsg[result.reason ?? ""] ?? `Error: ${result.reason}`

    const params = new URLSearchParams({
      action:   "add",
      upstream: upstream || "openai",
      name:     name || "",
      value:    value || "",
      domain:   domain || "",
    })

    notify("KeyShield", msg)
    chrome.tabs.create({ url: `${DASHBOARD_URL}/?${params}` })
    sendResponse({ ok: false, mode: "fallback", reason: result.reason })
  })()

  return true  // keep the sendResponse channel open for the async reply
})

// ── External messages (from dashboard via externally_connectable) ────────────

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message.type === "KS_TOKEN_REGISTER") {
    setStoredToken(message.token as string, message.user as string | null).then(() => {
      console.log("[KeyShield] token registered from dashboard")
      sendResponse({ ok: true })
    })
    return true
  }

  if (message.type === "KS_TOKEN_CLEAR") {
    clearStoredToken().then(() => {
      console.log("[KeyShield] token cleared")
      sendResponse({ ok: true })
    })
    return true
  }

  if (message.type === "KS_PING") {
    getStoredToken().then(({ token, user }) => {
      sendResponse({ ok: true, hasToken: !!token, user })
    })
    return true
  }

  return false
})

chrome.runtime.onInstalled.addListener(() => {
  console.log("[KeyShield] v1.1 installed — auto-detect + direct-store enabled")
})
