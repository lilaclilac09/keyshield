/******/ (() => { // webpackBootstrap
/******/ 	"use strict";

;// ./src/lib/log-client.ts
/**
 * Log client for report generator.
 * Fetches detection/autofill/saved logs from the background (secure storage).
 */
/**
 * Get logs (and vault summary) for the report. Uses background script to read from secure storage.
 */
function getLogsForReport(options) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_REPORT_LOGS', payload: { options } }, (response) => {
            if (chrome.runtime.lastError) {
                resolve({ success: false, error: chrome.runtime.lastError.message });
                return;
            }
            resolve(response ?? { success: false, error: 'No response' });
        });
    });
}

;// ./src/lib/report-generator.ts
/**
 * Report generator for Vault Audit Report.
 * Fetches vault metadata and detection/autofill logs, returns structured report data.
 */

/**
 * Generate report data: vault list + optional detection/autofill/saved logs.
 * Wallet is resolved by the background from session/storage.
 */
async function generateReport(options = {}) {
    const { includeLogs = true, dateFrom, dateTo } = options;
    const generatedAt = Date.now();
    const response = await getLogsForReport({
        from: dateFrom,
        to: dateTo,
        types: includeLogs ? undefined : [],
    });
    const vaults = response.vaultSummary ?? [];
    const allLogs = response.logs ?? [];
    const detectionLogs = allLogs.filter((l) => l.type === 'detection');
    const autofillLogs = allLogs.filter((l) => l.type === 'autofill');
    const savedLogs = allLogs.filter((l) => l.type === 'saved');
    const overview = {
        vaultCount: vaults.length,
        dateFrom,
        dateTo,
        generatedAt,
    };
    return {
        overview,
        vaults,
        detectionLogs,
        autofillLogs,
        savedLogs,
        generatedAt,
    };
}

;// ./src/report/report.ts
/**
 * KeyShield Vault Audit Report page
 * Fetches report data via generateReport and renders PDF-style layout.
 */

function formatDate(ts) {
    return new Date(ts).toLocaleString();
}
function renderReport(root, report) {
    const { overview, vaults, detectionLogs, autofillLogs, savedLogs, generatedAt } = report;
    const html = `
    <h1>KeyShield Vault Audit Report</h1>
    <p class="generated">Generated ${formatDate(generatedAt)}</p>

    <section>
      <h2>Overview</h2>
      <div class="overview">
        <ul>
          <li><strong>Vault count:</strong> ${overview.vaultCount}</li>
          ${overview.dateFrom != null ? `<li><strong>From:</strong> ${formatDate(overview.dateFrom)}</li>` : ''}
          ${overview.dateTo != null ? `<li><strong>To:</strong> ${formatDate(overview.dateTo)}</li>` : ''}
          <li><strong>Generated at:</strong> ${formatDate(overview.generatedAt)}</li>
        </ul>
      </div>
    </section>

    <section>
      <h2>Vault / Keys</h2>
      ${vaults.length === 0 ? '<p class="empty">No vaults in this report.</p>' : `
        <table>
          <thead><tr><th>Name</th><th>Domain</th><th>Vault ID</th><th>Created</th></tr></thead>
          <tbody>
            ${vaults.map((v) => `
              <tr>
                <td>${escapeHtml(v.keyName)}</td>
                <td>${escapeHtml(v.domain)}</td>
                <td><code>${v.vaultId.slice(0, 8)}…</code></td>
                <td>${formatDate(v.createdAt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>

    <section>
      <h2>Detection History</h2>
      ${detectionLogs.length === 0 ? '<p class="empty">No detections yet.</p>' : `
        <table>
          <thead><tr><th>Source</th><th>Preview</th><th>Domain</th><th>Time</th></tr></thead>
          <tbody>
            ${detectionLogs.map((log) => `
              <tr>
                <td>${escapeHtml(log.source ?? '—')}</td>
                <td><code>${escapeHtml(log.keyPreview ?? '—')}</code></td>
                <td>${escapeHtml(log.domain ?? '—')}</td>
                <td>${formatDate(log.timestamp)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>

    <section>
      <h2>Auto-Fill Log</h2>
      ${autofillLogs.length === 0 ? '<p class="empty">No auto-fills yet.</p>' : `
        <table>
          <thead><tr><th>Key (vault)</th><th>Domain</th><th>Status</th><th>Time</th></tr></thead>
          <tbody>
            ${autofillLogs.map((log) => `
              <tr>
                <td><code>${log.keyId ? log.keyId.slice(0, 8) + '…' : '—'}</code></td>
                <td>${escapeHtml(log.domain ?? '—')}</td>
                <td>${log.success ? 'Success' : 'Failed'}</td>
                <td>${formatDate(log.timestamp)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>

    ${savedLogs.length > 0 ? `
    <section>
      <h2>Saved to Vault</h2>
      <table>
        <thead><tr><th>Domain</th><th>Time</th></tr></thead>
        <tbody>
          ${savedLogs.map((log) => `
            <tr>
              <td>${escapeHtml(log.domain ?? '—')}</td>
              <td>${formatDate(log.timestamp)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
    ` : ''}

    <footer style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e4e4e7; font-size: 12px; color: #71717a; text-align: center;">
      KeyShield Vault Audit Report — ${formatDate(generatedAt)} — Client-side only, no server upload
    </footer>
  `;
    root.innerHTML = html;
}
function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}
function setStatus(root, message) {
    root.innerHTML = `<p id="status">${escapeHtml(message)}</p>`;
}
function parseDateInput(value) {
    if (!value)
        return undefined;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? undefined : t;
}
async function runReport() {
    const root = document.getElementById('report-root');
    if (!root)
        return;
    const includeLogsEl = document.getElementById('include-logs');
    const dateFromEl = document.getElementById('date-from');
    const dateToEl = document.getElementById('date-to');
    const generateBtn = document.getElementById('generate-btn');
    const exportBtn = document.getElementById('export-pdf');
    const walletData = await new Promise((resolve) => {
        chrome.storage.local.get('walletAddress', resolve);
    });
    if (!walletData.walletAddress) {
        setStatus(root, 'Wallet not connected. Connect your wallet in the extension popup first.');
        return;
    }
    async function generate() {
        generateBtn.disabled = true;
        setStatus(root, 'Generating report…');
        try {
            const dateFrom = parseDateInput(dateFromEl.value);
            const dateTo = parseDateInput(dateToEl.value);
            const report = await generateReport({
                includeLogs: includeLogsEl.checked,
                dateFrom,
                dateTo,
            });
            renderReport(root, report);
        }
        catch (err) {
            setStatus(root, `Error: ${err?.message ?? 'Failed to generate report'}`);
        }
        finally {
            generateBtn.disabled = false;
        }
    }
    generateBtn.addEventListener('click', generate);
    exportBtn.addEventListener('click', () => window.print());
    await generate();
}
runReport();

/******/ })()
;