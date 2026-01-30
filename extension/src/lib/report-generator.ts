/**
 * Report generator for Vault Audit Report.
 * Fetches vault metadata and detection/autofill logs, returns structured report data.
 */

import { getLogsForReport, type LogEntryWithId, type VaultSummaryItem } from './log-client';

export interface ReportOverview {
  vaultCount: number;
  dateFrom?: number;
  dateTo?: number;
  generatedAt: number;
}

export interface ReportData {
  overview: ReportOverview;
  vaults: VaultSummaryItem[];
  detectionLogs: LogEntryWithId[];
  autofillLogs: LogEntryWithId[];
  savedLogs: LogEntryWithId[];
  generatedAt: number;
}

export interface GenerateReportOptions {
  includeLogs?: boolean;
  dateFrom?: number;
  dateTo?: number;
}

/**
 * Generate report data: vault list + optional detection/autofill/saved logs.
 * Wallet is resolved by the background from session/storage.
 */
export async function generateReport(
  options: GenerateReportOptions = {}
): Promise<ReportData> {
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

  const overview: ReportOverview = {
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
