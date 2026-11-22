import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Download,
  ShieldCheck,
  FileSpreadsheet,
  FileJson,
  Printer,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  FolderOpen,
  RefreshCw,
  Save,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import {
  exportTransactionsToCsv,
  parseCsvRaw,
  parseOfxImport,
  previewCsvImport,
} from '../core/importer';
import { decryptVault, encryptVault } from '../core/crypto';
import { computeCategorySpend, computeDashboardKPIs } from '../core/analytics';
import type {
  BankImportPreset,
  DesktopBackupInfo,
  EncryptedVaultEnvelope,
  ParsedImportRow,
  VaultData,
} from '../types/finance';
import { Modal, Money, todayIso } from './ui';

const SAMPLE_BANK_CSV = `Date,Description,Amount,Notes
${todayIso()},Whole Foods Market,-84.32,Weekly groceries
${todayIso()},Blue Bottle Coffee,-6.50,Morning latte
${todayIso()},Spotify Family,-16.99,Monthly subscription
${todayIso()},Uber Trip Airport,-34.80,Ride share
${todayIso()},Amazon Return Credit,42.99,Refund for headphones
${todayIso()},Acme Corp Payroll,3250.00,Biweekly direct deposit`;

async function triggerFileSave(
  defaultName: string,
  content: string,
  mimeType: string,
  extFilter: { name: string; extensions: string[] }
): Promise<boolean> {
  if (window.vaultDesktop?.exportFileDialog) {
    const res = await window.vaultDesktop.exportFileDialog({
      defaultName,
      content,
      filters: [extFilter],
    });
    return !res.canceled;
  }
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

export const ImportExportModal: React.FC = () => {
  const open = useFinanceStore((s) => s.importExportOpen);
  const activeTab = useFinanceStore((s) => s.importExportTab);
  const openImportExport = useFinanceStore((s) => s.openImportExport);
  const closeImportExport = useFinanceStore((s) => s.closeImportExport);
  const data = useFinanceStore((s) => s.data);
  const importTransactions = useFinanceStore((s) => s.importTransactions);
  const saveImportPreset = useFinanceStore((s) => s.saveImportPreset);
  const deleteImportPreset = useFinanceStore((s) => s.deleteImportPreset);
  const replaceVaultData = useFinanceStore((s) => s.replaceVaultData);
  const createManualBackup = useFinanceStore((s) => s.createManualBackup);
  const showToast = useFinanceStore((s) => s.showToast);

  const currency = data.settings.baseCurrency;
  const privacyMask = data.settings.privacyMask;
  const isDesktop = Boolean(window.vaultDesktop?.isDesktop);

  // Import state
  const [targetAccountId, setTargetAccountId] = useState('');
  const [sourceFormat, setSourceFormat] = useState<'csv' | 'ofx'>('csv');
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);

  const [delimiter, setDelimiter] = useState<',' | ';' | '\t'>(',');
  const [skipRows, setSkipRows] = useState(1);
  const [dateColumn, setDateColumn] = useState(0);
  const [payeeColumn, setPayeeColumn] = useState(1);
  const [useSplitDebitCredit, setUseSplitDebitCredit] = useState(false);
  const [amountColumn, setAmountColumn] = useState(2);
  const [debitColumn, setDebitColumn] = useState(2);
  const [creditColumn, setCreditColumn] = useState(3);
  const [notesColumn, setNotesColumn] = useState<number>(-1);
  const [invertAmount, setInvertAmount] = useState(false);

  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [previewRows, setPreviewRows] = useState<ParsedImportRow[]>([]);

  // Encrypted backup state
  const [encPassphrase, setEncPassphrase] = useState('');
  const [encConfirm, setEncConfirm] = useState('');
  const [encrypting, setEncrypting] = useState(false);

  const [restoreRaw, setRestoreRaw] = useState<string | null>(null);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restoreNeedsPassword, setRestoreNeedsPassword] = useState(false);
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [restoring, setRestoring] = useState(false);

  // Desktop storage / snapshots
  const [storageInfo, setStorageInfo] = useState<{
    vaultPath: string;
    backupsDir: string;
    receiptsDir: string;
  } | null>(null);
  const [desktopBackups, setDesktopBackups] = useState<DesktopBackupInfo[]>([]);

  const importFileRef = useRef<HTMLInputElement>(null);
  const restoreFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (!targetAccountId && data.accounts[0]) {
      setTargetAccountId(data.accounts[0].id);
    }
    if (isDesktop && window.vaultDesktop) {
      window.vaultDesktop
        .getStorageInfo()
        .then(setStorageInfo)
        .catch(() => {});
      window.vaultDesktop
        .listBackups()
        .then(setDesktopBackups)
        .catch(() => {});
    }
  }, [open, data.accounts, targetAccountId, isDesktop]);

  const parsedCsvMatrix = useMemo(() => {
    if (sourceFormat !== 'csv' || !rawText.trim()) return [];
    return parseCsvRaw(rawText, delimiter);
  }, [sourceFormat, rawText, delimiter]);

  const csvHeaders = useMemo(() => {
    if (parsedCsvMatrix.length === 0) return [];
    const headerRow = parsedCsvMatrix[0] ?? [];
    const maxCols = Math.max(
      headerRow.length,
      ...parsedCsvMatrix.slice(0, 5).map((r) => r.length)
    );
    return Array.from({ length: maxCols }, (_, i) => headerRow[i] || `Column ${i + 1}`);
  }, [parsedCsvMatrix]);

  const fallbackCatId = useMemo(
    () => data.categories.find((c) => c.group !== 'income')?.id ?? 'cat_uncategorized',
    [data.categories]
  );

  // Auto-recompute preview rows whenever rawText or mapping changes
  useEffect(() => {
    if (!rawText.trim()) {
      setPreviewRows([]);
      return;
    }
    if (sourceFormat === 'ofx') {
      const rows = parseOfxImport(rawText, data.transactions, data.rules, fallbackCatId);
      setPreviewRows(rows);
      return;
    }
    if (parsedCsvMatrix.length === 0) {
      setPreviewRows([]);
      return;
    }
    const mapping: Omit<BankImportPreset, 'id' | 'name'> = {
      delimiter,
      skipRows,
      dateColumn,
      payeeColumn,
      amountColumn,
      debitColumn: useSplitDebitCredit ? debitColumn : undefined,
      creditColumn: useSplitDebitCredit ? creditColumn : undefined,
      notesColumn: notesColumn >= 0 ? notesColumn : undefined,
      invertAmount,
    };
    const rows = previewCsvImport(
      parsedCsvMatrix,
      mapping,
      data.transactions,
      data.rules,
      fallbackCatId
    );
    setPreviewRows(rows);
  }, [
    rawText,
    sourceFormat,
    parsedCsvMatrix,
    delimiter,
    skipRows,
    dateColumn,
    payeeColumn,
    amountColumn,
    useSplitDebitCredit,
    debitColumn,
    creditColumn,
    notesColumn,
    invertAmount,
    data.transactions,
    data.rules,
    fallbackCatId,
  ]);

  const loadRawImportContent = (name: string, content: string) => {
    setFileName(name);
    setRawText(content);
    const lower = name.toLowerCase();
    const looksOfx =
      lower.endsWith('.ofx') ||
      lower.endsWith('.qfx') ||
      content.toUpperCase().includes('<OFX>') ||
      content.toUpperCase().includes('<STMTTRN>');
    setSourceFormat(looksOfx ? 'ofx' : 'csv');

    if (!looksOfx) {
      const matrix = parseCsvRaw(content);
      const firstRow = (matrix[0] ?? []).map((h) => h.toLowerCase());
      const dIdx = firstRow.findIndex((h) => h.includes('date'));
      const pIdx = firstRow.findIndex(
        (h) => h.includes('desc') || h.includes('payee') || h.includes('merchant') || h.includes('name')
      );
      const aIdx = firstRow.findIndex((h) => h.includes('amount'));
      const nIdx = firstRow.findIndex((h) => h.includes('note') || h.includes('memo'));
      if (dIdx >= 0) setDateColumn(dIdx);
      if (pIdx >= 0) setPayeeColumn(pIdx);
      if (aIdx >= 0) {
        setAmountColumn(aIdx);
        setUseSplitDebitCredit(false);
      }
      setNotesColumn(nIdx >= 0 ? nIdx : -1);
      setSkipRows(1);
    }
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        loadRawImportContent(file.name, reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const applyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = data.importPresets.find((p) => p.id === presetId);
    if (!preset) return;
    setDelimiter(preset.delimiter);
    setSkipRows(preset.skipRows);
    setDateColumn(preset.dateColumn);
    setPayeeColumn(preset.payeeColumn);
    setAmountColumn(preset.amountColumn);
    const hasSplit = preset.debitColumn !== undefined && preset.creditColumn !== undefined;
    setUseSplitDebitCredit(hasSplit);
    if (preset.debitColumn !== undefined) setDebitColumn(preset.debitColumn);
    if (preset.creditColumn !== undefined) setCreditColumn(preset.creditColumn);
    setNotesColumn(preset.notesColumn ?? -1);
    setInvertAmount(preset.invertAmount);
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) {
      showToast('Enter a name for the bank import preset', 'error');
      return;
    }
    const saved = saveImportPreset({
      name: presetName.trim(),
      delimiter,
      skipRows,
      dateColumn,
      payeeColumn,
      amountColumn,
      debitColumn: useSplitDebitCredit ? debitColumn : undefined,
      creditColumn: useSplitDebitCredit ? creditColumn : undefined,
      notesColumn: notesColumn >= 0 ? notesColumn : undefined,
      invertAmount,
    });
    setSelectedPresetId(saved.id);
    setPresetName('');
    showToast(`Saved bank preset "${saved.name}"`, 'success');
  };

  const handleCommitImport = () => {
    if (!targetAccountId) {
      showToast('Please select a destination account', 'error');
      return;
    }
    const importedCount = importTransactions(previewRows, targetAccountId);
    if (importedCount > 0) {
      showToast(`Imported ${importedCount} transactions into Inbox`, 'success');
      setRawText('');
      setFileName('');
      setPreviewRows([]);
      closeImportExport();
    } else {
      showToast('No rows selected for import', 'info');
    }
  };

  const handleExportCsv = async () => {
    const csv = exportTransactionsToCsv(data.transactions, data.accounts, data.categories);
    const ok = await triggerFileSave(
      `vaultledger-transactions-${todayIso()}.csv`,
      csv,
      'text/csv;charset=utf-8',
      { name: 'CSV Spreadsheet', extensions: ['csv'] }
    );
    if (ok) showToast('Exported transactions CSV', 'success');
  };

  const handleExportJson = async () => {
    const json = JSON.stringify(data, null, 2);
    const ok = await triggerFileSave(
      `vaultledger-vault-${todayIso()}.json`,
      json,
      'application/json',
      { name: 'VaultLedger JSON', extensions: ['json'] }
    );
    if (ok) showToast('Exported full JSON vault', 'success');
  };

  const handleEncryptedBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (encPassphrase.length < 6) {
      showToast('Use a passphrase of at least 6 characters', 'error');
      return;
    }
    if (encPassphrase !== encConfirm) {
      showToast('Passphrases do not match', 'error');
      return;
    }
    setEncrypting(true);
    try {
      const envelope = await encryptVault(data, encPassphrase);
      const ok = await triggerFileSave(
        `vaultledger-backup-${todayIso()}.vledger`,
        JSON.stringify(envelope, null, 2),
        'application/json',
        { name: 'Encrypted VaultLedger Backup', extensions: ['vledger'] }
      );
      if (ok) {
        setEncPassphrase('');
        setEncConfirm('');
        showToast('Saved AES-256-GCM encrypted .vledger backup', 'success');
      }
    } catch {
      showToast('Failed to encrypt vault backup', 'error');
    } finally {
      setEncrypting(false);
    }
  };

  const handleRestoreFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      try {
        const parsed = JSON.parse(reader.result) as Record<string, unknown>;
        setRestoreFileName(file.name);
        setRestoreRaw(reader.result);
        setRestorePassphrase('');
        if (parsed.format === 'vaultledger-encrypted-v1') {
          setRestoreNeedsPassword(true);
        } else {
          setRestoreNeedsPassword(false);
        }
      } catch {
        showToast('Selected file is not valid JSON or .vledger format', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExecuteRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreRaw) return;
    setRestoring(true);
    try {
      const parsed = JSON.parse(restoreRaw) as EncryptedVaultEnvelope | VaultData;
      let restoredVault: VaultData;
      if ('format' in parsed && parsed.format === 'vaultledger-encrypted-v1') {
        restoredVault = await decryptVault(parsed, restorePassphrase);
      } else {
        const candidate = parsed as VaultData;
        if (!Array.isArray(candidate.accounts) || !Array.isArray(candidate.transactions)) {
          throw new Error('Invalid vault schema');
        }
        restoredVault = candidate;
      }
      replaceVaultData(restoredVault);
      showToast('Vault restored successfully!', 'success');
      setRestoreRaw(null);
      setRestoreFileName('');
      setRestorePassphrase('');
      closeImportExport();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to decrypt or restore backup',
        'error'
      );
    } finally {
      setRestoring(false);
    }
  };

  const selectedImportCount = previewRows.filter((r) => r.selected).length;
  const duplicateImportCount = previewRows.filter((r) => r.isDuplicate).length;

  const reportKpis = useMemo(() => computeDashboardKPIs(data, 'this_month'), [data]);
  const reportTopCats = useMemo(
    () => computeCategorySpend(data, 'this_month').filter((c) => c.spent > 0).slice(0, 6),
    [data]
  );

  return (
    <Modal
      open={open}
      onClose={closeImportExport}
      title="Import, Export & Encrypted Backup"
      subtitle="100% local processing · Files never leave your computer"
      maxWidthClass="max-w-4xl"
    >
      {/* Tabs Header */}
      <div className="no-print px-5 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
        {[
          { id: 'import' as const, label: 'Import CSV / OFX', icon: Upload },
          { id: 'export' as const, label: 'Export & Report', icon: Download },
          { id: 'backup' as const, label: 'Encrypted Vault Backup', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => openImportExport(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="p-5">
        {/* TAB 1: IMPORT CSV / OFX */}
        {activeTab === 'import' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".csv,.ofx,.qfx,.txt"
                  onChange={handleImportFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => importFileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload .CSV / .OFX / .QFX
                </button>
                <button
                  type="button"
                  onClick={() => setShowPasteBox((v) => !v)}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {showPasteBox ? 'Hide Paste Box' : 'Paste CSV'}
                </button>
                <button
                  type="button"
                  onClick={() => loadRawImportContent('sample-bank-statement.csv', SAMPLE_BANK_CSV)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-amber-500/12 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Try Sample Bank CSV
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Into Account:</span>
                <select
                  value={targetAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                  className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-medium outline-none"
                >
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {showPasteBox && (
              <textarea
                rows={4}
                value={rawText}
                onChange={(e) => loadRawImportContent('pasted.csv', e.target.value)}
                placeholder="Paste raw CSV rows here..."
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 text-xs font-mono outline-none focus:border-indigo-500"
              />
            )}

            {/* CSV Column Mapper + Presets */}
            {rawText && sourceFormat === 'csv' && csvHeaders.length > 0 && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    CSV Column Mapper {fileName ? `· ${fileName}` : ''}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {data.importPresets.length > 0 && (
                      <div className="flex items-center gap-1">
                        <select
                          value={selectedPresetId}
                          onChange={(e) => applyPreset(e.target.value)}
                          className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1 text-xs outline-none"
                        >
                          <option value="">Load Preset...</option>
                          {data.importPresets.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        {selectedPresetId && (
                          <button
                            type="button"
                            onClick={() => {
                              deleteImportPreset(selectedPresetId);
                              setSelectedPresetId('');
                            }}
                            className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                            title="Delete selected preset"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                    <input
                      type="text"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      placeholder="New preset name..."
                      className="w-32 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1 text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSavePreset}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-medium cursor-pointer"
                    >
                      <Save className="w-3 h-3" /> Save
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-500">Date Column</span>
                    <select
                      value={dateColumn}
                      onChange={(e) => setDateColumn(Number(e.target.value))}
                      className="w-full rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1.5"
                    >
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>
                          {i + 1}: {h}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-500">Payee Column</span>
                    <select
                      value={payeeColumn}
                      onChange={(e) => setPayeeColumn(Number(e.target.value))}
                      className="w-full rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1.5"
                    >
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>
                          {i + 1}: {h}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!useSplitDebitCredit ? (
                    <label className="space-y-1">
                      <span className="text-[11px] text-slate-500">Amount Column</span>
                      <select
                        value={amountColumn}
                        onChange={(e) => setAmountColumn(Number(e.target.value))}
                        className="w-full rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1.5"
                      >
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>
                            {i + 1}: {h}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <>
                      <label className="space-y-1">
                        <span className="text-[11px] text-slate-500">Debit Column</span>
                        <select
                          value={debitColumn}
                          onChange={(e) => setDebitColumn(Number(e.target.value))}
                          className="w-full rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1.5"
                        >
                          {csvHeaders.map((h, i) => (
                            <option key={i} value={i}>
                              {i + 1}: {h}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] text-slate-500">Credit Column</span>
                        <select
                          value={creditColumn}
                          onChange={(e) => setCreditColumn(Number(e.target.value))}
                          className="w-full rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1.5"
                        >
                          {csvHeaders.map((h, i) => (
                            <option key={i} value={i}>
                              {i + 1}: {h}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-500">Notes (Optional)</span>
                    <select
                      value={notesColumn}
                      onChange={(e) => setNotesColumn(Number(e.target.value))}
                      className="w-full rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1.5"
                    >
                      <option value={-1}>None</option>
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>
                          {i + 1}: {h}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300 pt-1">
                  <label className="inline-flex items-center gap-1.5">
                    <span>Skip rows:</span>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={skipRows}
                      onChange={(e) => setSkipRows(Math.max(0, Number(e.target.value) || 0))}
                      className="w-12 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-1.5 py-0.5 text-xs tabular-nums"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useSplitDebitCredit}
                      onChange={(e) => setUseSplitDebitCredit(e.target.checked)}
                    />
                    <span>Separate Debit/Credit cols</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={invertAmount}
                      onChange={(e) => setInvertAmount(e.target.checked)}
                    />
                    <span>Invert Sign (+/-)</span>
                  </label>
                </div>
              </div>
            )}

            {/* Preview Table */}
            {previewRows.length > 0 ? (
              <div className="space-y-3">
                <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                      <tr>
                        <th className="py-2 px-3 w-8">Inc</th>
                        <th className="py-2 px-2">Date</th>
                        <th className="py-2 px-2">Payee</th>
                        <th className="py-2 px-2">Category</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {previewRows.map((row, idx) => (
                        <tr
                          key={`${row.importHash}-${idx}`}
                          className={
                            row.isDuplicate ? 'bg-amber-500/8' : row.selected ? '' : 'opacity-50'
                          }
                        >
                          <td className="py-2 px-3">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={() =>
                                setPreviewRows((prev) =>
                                  prev.map((r, i) =>
                                    i === idx ? { ...r, selected: !r.selected } : r
                                  )
                                )
                              }
                            />
                          </td>
                          <td className="py-2 px-2 tabular-nums text-slate-500">{row.date}</td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {row.payee}
                              </span>
                              {row.isDuplicate && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Duplicate Detected
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <select
                              value={row.categoryId}
                              onChange={(e) =>
                                setPreviewRows((prev) =>
                                  prev.map((r, i) =>
                                    i === idx ? { ...r, categoryId: e.target.value } : r
                                  )
                                )
                              }
                              className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1 text-[11px]"
                            >
                              {data.categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3 text-right font-semibold">
                            <Money
                              amount={row.type === 'expense' ? -row.amount : row.amount}
                              currency={currency}
                              privacyMask={privacyMask}
                              showSign
                              className={
                                row.type === 'income'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : row.type === 'refund'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-900 dark:text-slate-100'
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <strong className="text-slate-900 dark:text-white">{selectedImportCount}</strong>{' '}
                    selected to import ·{' '}
                    <strong className="text-amber-600 dark:text-amber-400">
                      {duplicateImportCount}
                    </strong>{' '}
                    duplicates auto-unchecked
                  </div>
                  <button
                    type="button"
                    disabled={selectedImportCount === 0}
                    onClick={handleCommitImport}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Import {selectedImportCount} Selected
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-xs text-slate-400">
                Upload a bank CSV/OFX/QFX export or click &ldquo;Try Sample Bank CSV&rdquo; to preview smart auto-categorization &amp; duplicate protection.
              </div>
            )}
          </div>
        )}

        {/* TAB 2: EXPORT & PRINTABLE REPORT */}
        {activeTab === 'export' && (
          <div className="space-y-5">
            <div className="no-print grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl p-4 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4">
                <div>
                  <FileSpreadsheet className="w-6 h-6 text-emerald-500 mb-2" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Transactions CSV
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Clean spreadsheet with dates, signed amounts, splits, categories, and tags.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="w-full py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                >
                  Download CSV ({data.transactions.length} rows)
                </button>
              </div>

              <div className="rounded-2xl p-4 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4">
                <div>
                  <FileJson className="w-6 h-6 text-indigo-500 mb-2" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Full Vault JSON
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Unencrypted complete export including accounts, budgets, rules, and goals.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Download JSON
                </button>
              </div>

              <div className="rounded-2xl p-4 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4">
                <div>
                  <Printer className="w-6 h-6 text-amber-500 mb-2" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Printable Report
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Print or Save as PDF using your OS print dialog for clean paper records.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="w-full py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 text-xs font-semibold cursor-pointer"
                >
                  Print / Save PDF
                </button>
              </div>
            </div>

            {/* Printable Monthly Financial Summary Sheet */}
            <div className="rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    VaultLedger Monthly Financial Report
                  </h3>
                  <p className="text-xs text-slate-400">Generated locally on {todayIso()}</p>
                </div>
                <span className="text-xs font-mono text-slate-400">{currency}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-slate-400">Net Worth</div>
                  <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                    <Money amount={reportKpis.totalNetWorth} currency={currency} privacyMask={privacyMask} />
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Monthly Income</div>
                  <div className="text-base font-bold text-emerald-600 mt-0.5">
                    <Money amount={reportKpis.periodIncome} currency={currency} privacyMask={privacyMask} />
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Monthly Expenses</div>
                  <div className="text-base font-bold text-rose-600 mt-0.5">
                    <Money amount={reportKpis.periodExpenses} currency={currency} privacyMask={privacyMask} />
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Savings Rate</div>
                  <div className="text-base font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 tabular-nums">
                    {reportKpis.savingsRate.toFixed(1)}%
                  </div>
                </div>
              </div>

              {reportTopCats.length > 0 && (
                <div className="pt-2">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                    Top Monthly Spending Categories
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {reportTopCats.map((c) => (
                      <div
                        key={c.categoryId}
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900"
                      >
                        <span>{c.categoryName}</span>
                        <Money
                          amount={c.spent}
                          currency={currency}
                          privacyMask={privacyMask}
                          className="font-semibold"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: ENCRYPTED VAULT BACKUP */}
        {activeTab === 'backup' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Create AES-256-GCM Backup */}
              <form
                onSubmit={handleEncryptedBackup}
                className="rounded-2xl p-5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Create Encrypted .vledger Backup
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sealed with PBKDF2-SHA256 (120k iterations) + AES-256-GCM authenticated encryption.
                </p>
                <input
                  type="password"
                  value={encPassphrase}
                  onChange={(e) => setEncPassphrase(e.target.value)}
                  placeholder="Backup passphrase (min 6 chars)"
                  required
                  className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                />
                <input
                  type="password"
                  value={encConfirm}
                  onChange={(e) => setEncConfirm(e.target.value)}
                  placeholder="Confirm passphrase"
                  required
                  className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={encrypting || !encPassphrase}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                >
                  {encrypting ? 'Encrypting...' : 'Encrypt & Download .vledger'}
                </button>
              </form>

              {/* Restore Backup */}
              <form
                onSubmit={handleExecuteRestore}
                className="rounded-2xl p-5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <Unlock className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Restore from .vledger or .json
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Move your vault seamlessly between Web and Desktop or recover from an archive.
                </p>

                <input
                  ref={restoreFileRef}
                  type="file"
                  accept=".vledger,.json"
                  onChange={handleRestoreFileSelected}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => restoreFileRef.current?.click()}
                  className="w-full py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {restoreFileName ? `Selected: ${restoreFileName}` : 'Choose .vledger or .json File'}
                </button>

                {restoreNeedsPassword && (
                  <input
                    type="password"
                    value={restorePassphrase}
                    onChange={(e) => setRestorePassphrase(e.target.value)}
                    placeholder="Enter backup decryption passphrase"
                    required
                    className="w-full rounded-xl bg-white dark:bg-slate-900 border border-indigo-500/50 px-3 py-2 text-xs outline-none"
                  />
                )}

                <button
                  type="submit"
                  disabled={!restoreRaw || restoring || (restoreNeedsPassword && !restorePassphrase)}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                >
                  {restoring ? 'Restoring...' : 'Restore Vault'}
                </button>
              </form>
            </div>

            {/* Desktop Storage & Rolling Auto-Backups */}
            {isDesktop && (
              <div className="rounded-2xl p-4 bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Desktop Local Vault &amp; Rolling Snapshots
                    </h4>
                    {storageInfo && (
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate max-w-lg">
                        {storageInfo.vaultPath}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => window.vaultDesktop?.openDataFolder()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" /> Open Folder
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await createManualBackup();
                        if (res.ok) {
                          showToast(`Snapshot created: ${res.fileName ?? 'backup'}`, 'success');
                          window.vaultDesktop?.listBackups().then(setDesktopBackups).catch(() => {});
                        }
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Create Snapshot
                    </button>
                  </div>
                </div>

                {desktopBackups.length > 0 && (
                  <div className="max-h-32 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {desktopBackups.slice(0, 8).map((b) => (
                      <div key={b.fileName} className="py-1.5 flex items-center justify-between">
                        <span className="font-mono text-slate-700 dark:text-slate-300 truncate">
                          {b.fileName}
                        </span>
                        <span className="text-slate-400 tabular-nums shrink-0">
                          {(b.sizeBytes / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
