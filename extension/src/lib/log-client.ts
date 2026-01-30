/**
 * Log client for report generator.
 * Fetches detection/autofill/saved logs from the background (secure storage).
 */

import type { LogEntryPayload } from '../storage/secure-storage';

export interface GetLogsOptions {
  from?: number;
  to?: number;
  types?: LogEntryPayload['type'][];
}

export interface LogEntryWithId extends LogEntryPayload {
  id: string;
}

export interface VaultSummaryItem {
  vaultId: string;
  owner: string;
  domain: string;
  keyName: string;
  createdAt: number;
}

export interface GetReportLogsResponse {
  success: boolean;
  logs?: LogEntryWithId[];
  vaultSummary?: VaultSummaryItem[];
  error?: string;
}

/**
 * Get logs (and vault summary) for the report. Uses background script to read from secure storage.
 */
export function getLogsForReport(options?: GetLogsOptions): Promise<GetReportLogsResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'GET_REPORT_LOGS', payload: { options } },
      (response: GetReportLogsResponse | undefined) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response ?? { success: false, error: 'No response' });
      }
    );
  });
}
