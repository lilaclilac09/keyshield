/**
 * KeyShield service worker (Manifest V3 background).
 *
 * Lightweight router between the content script and chrome.storage.
 * Responsibilities, in scope today:
 *
 *   1. Receive `KEYS_DETECTED` messages from content scripts and queue
 *      them in chrome.storage.local under `keyshield-sync.detected-queue`,
 *      so the popup can render an inbox of "click to save" candidates.
 *   2. Receive `STORE_KEY` messages (the user clicked the floating
 *      "Save" toast) and write the encrypted blob into the same queue
 *      with a `pending-store` flag for the popup to pick up — the popup
 *      owns the actual vault upsert because it holds the master key.
 *   3. Toggle the page-action badge based on queue depth so users can
 *      see at a glance that there's something to triage.
 *
 * Out of scope (deliberate):
 *   - Talking to Lit Protocol, Solana, x402. Those decisions live in
 *     the popup which has the user's session unlocked.
 *   - Fetching / pushing the encrypted vault. The popup's useVaultFlow
 *     hook owns the sync side.
 */

const QUEUE_KEY = 'keyshield-sync.detected-queue';
const MAX_QUEUE_LEN = 50;

type DetectedKeyShape = {
  key: string;
  source: string;
  domain: string;
  timestamp: number;
  provider?: string;
  confidence: number;
  fieldName?: string;
  fieldType?: string;
};

interface PendingStore {
  kind: 'pending-store';
  detected: DetectedKeyShape;
  encryptedData?: string;
  encryptedSymmetricKey?: string;
  enqueuedAt: number;
}

interface DetectedNotice {
  kind: 'detected';
  detected: DetectedKeyShape;
  enqueuedAt: number;
}

type QueueItem = PendingStore | DetectedNotice;

async function readQueue(): Promise<QueueItem[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([QUEUE_KEY], (out) => {
      resolve((out[QUEUE_KEY] as QueueItem[] | undefined) ?? []);
    });
  });
}

async function writeQueue(q: QueueItem[]): Promise<void> {
  return new Promise((resolve) => {
    // Cap queue length so a runaway tab can't pin storage.
    const trimmed = q.slice(-MAX_QUEUE_LEN);
    chrome.storage.local.set({ [QUEUE_KEY]: trimmed }, () => resolve());
  });
}

function refreshBadge(count: number) {
  if (typeof chrome.action === 'undefined') return;
  if (count === 0) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  chrome.action.setBadgeText({ text: String(count > 99 ? '99+' : count) });
  chrome.action.setBadgeBackgroundColor({ color: '#6627ff' });
}

chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
  // Use an async IIFE so we can `return true` synchronously (required by
  // chrome.runtime.onMessage to keep sendResponse alive).
  (async () => {
    try {
      switch (msg?.type) {
        case 'KEYS_DETECTED': {
          const incoming: DetectedKeyShape[] = Array.isArray(msg.keys) ? msg.keys : [];
          const queue = await readQueue();
          const now = Date.now();
          // Dedup on (provider, key) so noisy MutationObservers don't flood.
          const seen = new Set(
            queue.map((q) => `${q.detected.provider ?? '?'}::${q.detected.key}`),
          );
          for (const k of incoming) {
            const id = `${k.provider ?? '?'}::${k.key}`;
            if (seen.has(id)) continue;
            seen.add(id);
            queue.push({ kind: 'detected', detected: k, enqueuedAt: now });
          }
          await writeQueue(queue);
          refreshBadge(queue.length);
          sendResponse({ ok: true, queued: queue.length });
          return;
        }

        case 'STORE_KEY': {
          const item: PendingStore = {
            kind: 'pending-store',
            detected: msg.key,
            encryptedData: msg.key?.encryptedData,
            encryptedSymmetricKey: msg.key?.encryptedSymmetricKey,
            enqueuedAt: Date.now(),
          };
          const queue = await readQueue();
          queue.push(item);
          await writeQueue(queue);
          refreshBadge(queue.length);
          sendResponse({ ok: true });
          return;
        }

        case 'INITIATE_PAYMENT':
        case 'INITIATE_STREAMING_PAYMENT': {
          // Stub — the real x402 wiring lives in the popup. We just log
          // here so the content-script can fire-and-forget without
          // blocking the page.
          // eslint-disable-next-line no-console
          console.info('[KeyShield bg] x402 payment intent:', msg);
          sendResponse({ ok: true, deferred: true });
          return;
        }

        case 'GET_QUEUE': {
          const queue = await readQueue();
          sendResponse({ ok: true, queue });
          return;
        }

        case 'CLEAR_QUEUE': {
          await writeQueue([]);
          refreshBadge(0);
          sendResponse({ ok: true });
          return;
        }

        default:
          sendResponse({ ok: false, error: `unknown message type: ${msg?.type}` });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[KeyShield bg] handler error:', err);
      sendResponse({ ok: false, error: String(err) });
    }
  })();
  return true; // keep sendResponse alive across async work
});

// Re-sync the badge on service-worker wake-up.
(async () => {
  const queue = await readQueue();
  refreshBadge(queue.length);
})();

export {};
