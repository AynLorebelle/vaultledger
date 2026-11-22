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
  Eye,
  EyeOff,
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
  const [importDragOver, setImportDragOver] = useState(false);

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
  const [showEncPassphrase, setShowEncPassphrase] = useState(false);
  const [encrypting, setEncrypting] = useState(false);

  const [restoreRaw, setRestoreRaw] = useState<string | null>(null);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restoreNeedsPassword, setRestoreNeedsPassword] = useState(false);
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [showRestorePassphrase, setShowRestorePassphrase] = useState(false);
  const [restoreDragOver, setRestoreDragOver] = useState(false);
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

  const targetAccount = useMemo(
    () => data.accounts.find((a) => a.id === targetAccountId) ?? null,
    [data.accounts, targetAccountId]
  );
  const importCurrency = targetAccount?.currency ?? currency;

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
        (h) =>
          h.includes('desc') ||
          h.includes('payee') ||
          h.includes('merchant') ||
          h.includes('name')
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

  const readImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        loadRawImportContent(file.name, reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readImportFile(file);
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
      `aynlytics-transactions-${todayIso()}.csv`,
      csv,
      'text/csv;charset=utf-8',
      { name: 'CSV Spreadsheet', extensions: ['csv'] }
    );
    if (ok) showToast('Exported transactions CSV', 'success');
  };

  const handleExportJson = async () => {
    const json = JSON.stringify(data, null, 2);
    const ok = await triggerFileSave(
      `aynlytics-vault-${todayIso()}.json`,
      json,
      'application/json',
      { name: 'AYNLYTICS JSON', extensions: ['json'] }
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
        `aynlytics-backup-${todayIso()}.vledger`,
        JSON.stringify(envelope, null, 2),
        'application/json',
        { name: 'Encrypted AYNLYTICS Backup', extensions: ['vledger'] }
      );
      if (ok) {
        setEncPassphrase('');
        setEncConfirm('');
        setShowEncPassphrase(false);
        showToast('Saved AES-256-GCM encrypted .vledger backup', 'success');
      }
    } catch {
      showToast('Failed to encrypt vault backup', 'error');
    } finally {
      setEncrypting(false);
    }
  };

  const readRestoreFile = (file: File) => {
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
  };

  const handleRestoreFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readRestoreFile(file);
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
      setShowRestorePassphrase(false);
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
      <div
        role="tablist"
        aria-label="Import, Export, and Backup sections"
        className="no-print px-5 pt-2 border-b border-[var(--border-hairline)] flex items-center gap-1 overflow-x-auto"
      >
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
              role="tab"
              aria-selected={active}
              onClick={() => openImportExport(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'border-[var(--accent-primary)] text-[var(--accent-primary-text)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="p-5">
        {/* TAB 1: IMPORT CSV / OFX */}
        {activeTab === 'import' && (
          <div className="space-y-5" role="tabpanel" aria-label="Import CSV or OFX">
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
                  className="tactile-btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Upload .CSV / .OFX / .QFX</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPasteBox((v) => !v)}
                  className="tactile-btn px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  {showPasteBox ? 'Hide Paste Box' : 'Paste CSV'}
                </button>
                <button
                  type="button"
                  onClick={() => loadRawImportContent('sample-bank-statement.csv', SAMPLE_BANK_CSV)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  style={{
                    background: 'var(--accent-warning-soft)',
                    color: 'var(--accent-warning)',
                  }}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Try Sample Bank CSV</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="import-target-account"
                  className="text-xs font-medium text-[var(--text-muted)]"
                >
                  Into Account:
                </label>
                <select
                  id="import-target-account"
                  value={targetAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                  className="tactile-input px-3 py-1.5 text-xs font-medium cursor-pointer focus:border-[var(--accent-primary)]"
                >
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {showPasteBox && (
              <div>
                <label
                  htmlFor="import-paste-csv"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                >
                  Paste Raw CSV Content
                </label>
                <textarea
                  id="import-paste-csv"
                  rows={4}
                  value={rawText}
                  onChange={(e) => loadRawImportContent('pasted.csv', e.target.value)}
                  placeholder="Paste raw CSV rows here..."
                  className="tactile-input w-full p-3 text-xs font-mono focus:border-[var(--accent-primary)]"
                />
              </div>
            )}

            {/* CSV Column Mapper + Presets */}
            {rawText && sourceFormat === 'csv' && csvHeaders.length > 0 && (
              <div className="tactile-well p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    CSV Column Mapper {fileName ? `· ${fileName}` : ''}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {data.importPresets.length > 0 && (
                      <div className="flex items-center gap-1">
                        <select
                          aria-label="Load saved bank import preset"
                          value={selectedPresetId}
                          onChange={(e) => applyPreset(e.target.value)}
                          className="tactile-input px-2 py-1 text-xs cursor-pointer"
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
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-danger)] hover:bg-[var(--accent-danger-soft)] transition-colors cursor-pointer"
                            aria-label="Delete selected preset"
                            title="Delete selected preset"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    )}
                    <input
                      type="text"
                      aria-label="New bank import preset name"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      placeholder="New preset name..."
                      className="tactile-input w-36 px-2.5 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleSavePreset}
                      className="tactile-btn-primary inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      <Save className="w-3 h-3" aria-hidden="true" />
                      <span>Save</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <label className="space-y-1">
                    <span className="block text-[11px] font-medium text-[var(--text-secondary)]">
                      Date Column
                    </span>
                    <select
                      value={dateColumn}
                      onChange={(e) => setDateColumn(Number(e.target.value))}
                      className="tactile-input w-full px-2 py-1.5 cursor-pointer"
                    >
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>
                          {i + 1}: {h}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] font-medium text-[var(--text-secondary)]">
                      Payee Column
                    </span>
                    <select
                      value={payeeColumn}
                      onChange={(e) => setPayeeColumn(Number(e.target.value))}
                      className="tactile-input w-full px-2 py-1.5 cursor-pointer"
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
                      <span className="block text-[11px] font-medium text-[var(--text-secondary)]">
                        Amount Column
                      </span>
                      <select
                        value={amountColumn}
                        onChange={(e) => setAmountColumn(Number(e.target.value))}
                        className="tactile-input w-full px-2 py-1.5 cursor-pointer"
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
                        <span className="block text-[11px] font-medium text-[var(--text-secondary)]">
                          Debit Column
                        </span>
                        <select
                          value={debitColumn}
                          onChange={(e) => setDebitColumn(Number(e.target.value))}
                          className="tactile-input w-full px-2 py-1.5 cursor-pointer"
                        >
                          {csvHeaders.map((h, i) => (
                            <option key={i} value={i}>
                              {i + 1}: {h}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[11px] font-medium text-[var(--text-secondary)]">
                          Credit Column
                        </span>
                        <select
                          value={creditColumn}
                          onChange={(e) => setCreditColumn(Number(e.target.value))}
                          className="tactile-input w-full px-2 py-1.5 cursor-pointer"
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
                    <span className="block text-[11px] font-medium text-[var(--text-secondary)]">
                      Notes (Optional)
                    </span>
                    <select
                      value={notesColumn}
                      onChange={(e) => setNotesColumn(Number(e.target.value))}
                      className="tactile-input w-full px-2 py-1.5 cursor-pointer"
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

                <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)] pt-1">
                  <label className="inline-flex items-center gap-1.5">
                    <span>Delimiter:</span>
                    <select
                      value={delimiter}
                      onChange={(e) => setDelimiter(e.target.value as ',' | ';' | '\t')}
                      className="tactile-input px-2 py-0.5 text-xs cursor-pointer"
                    >
                      <option value=",">Comma (,)</option>
                      <option value=";">Semicolon (;)</option>
                      <option value={'\t'}>Tab</option>
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <span>Skip rows:</span>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={skipRows}
                      onChange={(e) => setSkipRows(Math.max(0, Number(e.target.value) || 0))}
                      className="tactile-input w-14 px-2 py-0.5 text-xs tabular-nums"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useSplitDebitCredit}
                      onChange={(e) => setUseSplitDebitCredit(e.target.checked)}
                      className="rounded accent-[var(--accent-primary)]"
                    />
                    <span>Separate Debit/Credit cols</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={invertAmount}
                      onChange={(e) => setInvertAmount(e.target.checked)}
                      className="rounded accent-[var(--accent-primary)]"
                    />
                    <span>Invert Sign (+/-)</span>
                  </label>
                </div>
              </div>
            )}

            {/* Preview Table OR Drag-and-Drop Zone */}
            {previewRows.length > 0 ? (
              <div className="space-y-3">
                <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[var(--bg-subtle)] border-b border-[var(--border-hairline)] text-[11px] font-semibold text-[var(--text-secondary)]">
                      <tr>
                        <th className="py-2 px-3 w-8">Inc</th>
                        <th className="py-2 px-2">Date</th>
                        <th className="py-2 px-2">Payee</th>
                        <th className="py-2 px-2">Category</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-hairline)]">
                      {previewRows.map((row, idx) => (
                        <tr
                          key={`${row.importHash}-${idx}`}
                          style={
                            row.isDuplicate
                              ? { background: 'var(--accent-warning-soft)' }
                              : undefined
                          }
                          className={row.selected ? '' : 'opacity-55'}
                        >
                          <td className="py-2 px-3">
                            <input
                              type="checkbox"
                              aria-label={`Include row ${idx + 1}: ${row.payee}`}
                              checked={row.selected}
                              onChange={() =>
                                setPreviewRows((prev) =>
                                  prev.map((r, i) =>
                                    i === idx ? { ...r, selected: !r.selected } : r
                                  )
                                )
                              }
                              className="rounded accent-[var(--accent-primary)] cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-2 tabular-nums text-[var(--text-muted)]">
                            {row.date}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-[var(--text-primary)]">
                                {row.payee}
                              </span>
                              {row.isDuplicate && (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                  style={{
                                    background: 'var(--accent-warning-soft)',
                                    color: 'var(--accent-warning)',
                                  }}
                                >
                                  <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" />
                                  <span>Duplicate Detected</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <select
                              aria-label={`Category for ${row.payee}`}
                              value={row.categoryId}
                              onChange={(e) =>
                                setPreviewRows((prev) =>
                                  prev.map((r, i) =>
                                    i === idx ? { ...r, categoryId: e.target.value } : r
                                  )
                                )
                              }
                              className="tactile-input px-2 py-1 text-[11px] cursor-pointer"
                            >
                              {data.categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3 text-right font-semibold tabular-nums">
                            <Money
                              amount={row.type === 'expense' ? -row.amount : row.amount}
                              currency={importCurrency}
                              privacyMask={privacyMask}
                              showSign
                              className={
                                row.type === 'income'
                                  ? 'text-[var(--accent-positive)]'
                                  : row.type === 'refund'
                                    ? 'text-[var(--accent-warning)]'
                                    : 'text-[var(--text-primary)]'
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="text-xs text-[var(--text-muted)] tabular-nums">
                    <strong className="text-[var(--text-primary)]">{selectedImportCount}</strong>{' '}
                    selected to import ·{' '}
                    <strong style={{ color: 'var(--accent-warning)' }}>
                      {duplicateImportCount}
                    </strong>{' '}
                    duplicates auto-unchecked
                  </div>
                  <button
                    type="button"
                    disabled={selectedImportCount === 0}
                    onClick={handleCommitImport}
                    className="tactile-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl disabled:opacity-40 text-xs font-semibold cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    <span>Import {selectedImportCount} Selected</span>
                  </button>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                aria-label="Drop a bank CSV, OFX, or QFX file here or click to upload"
                onDragOver={(e) => {
                  e.preventDefault();
                  setImportDragOver(true);
                }}
                onDragLeave={() => setImportDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setImportDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) readImportFile(file);
                }}
                onClick={() => importFileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    importFileRef.current?.click();
                  }
                }}
                className="rounded-xl border border-dashed p-8 text-center text-xs transition-colors cursor-pointer space-y-2"
                style={
                  importDragOver
                    ? {
                        borderColor: 'var(--accent-primary)',
                        background: 'var(--accent-primary-soft)',
                        color: 'var(--text-primary)',
                      }
                    : {
                        borderColor: 'var(--border-strong)',
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-muted)',
                      }
                }
              >
                <Upload className="w-5 h-5 mx-auto text-[var(--text-muted)]" aria-hidden="true" />
                <p>
                  Drag &amp; drop a bank <strong>.CSV / .OFX / .QFX</strong> export here, click to
                  upload, or use &ldquo;Try Sample Bank CSV&rdquo; to preview auto-categorization
                  &amp; duplicate protection.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: EXPORT & PRINTABLE REPORT */}
        {activeTab === 'export' && (
          <div className="space-y-5" role="tabpanel" aria-label="Export and Printable Report">
            <div className="no-print grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="tactile-well p-4 flex flex-col justify-between gap-4">
                <div>
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center mb-2.5"
                    style={{
                      background: 'var(--accent-positive-soft)',
                      color: 'var(--accent-positive)',
                    }}
                  >
                    <FileSpreadsheet className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Transactions CSV
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                    Clean spreadsheet with dates, signed amounts, splits, categories, and tags.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="tactile-btn-primary w-full py-2 rounded-xl text-xs font-semibold tabular-nums cursor-pointer"
                >
                  Download CSV ({data.transactions.length} rows)
                </button>
              </div>

              <div className="tactile-well p-4 flex flex-col justify-between gap-4">
                <div>
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center mb-2.5"
                    style={{
                      background: 'var(--accent-info-soft)',
                      color: 'var(--accent-info)',
                    }}
                  >
                    <FileJson className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Full Vault JSON
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                    Unencrypted complete export including accounts, budgets, rules, FX rates, and
                    goals.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="tactile-btn w-full py-2 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Download JSON
                </button>
              </div>

              <div className="tactile-well p-4 flex flex-col justify-between gap-4">
                <div>
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center mb-2.5"
                    style={{
                      background: 'var(--accent-warning-soft)',
                      color: 'var(--accent-warning)',
                    }}
                  >
                    <Printer className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Printable Report
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                    Print or Save as PDF using your OS print dialog for clean paper records.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="w-full py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  style={{
                    background: 'var(--accent-warning-soft)',
                    color: 'var(--accent-warning)',
                  }}
                >
                  Print / Save PDF
                </button>
              </div>
            </div>

            {/* Printable Monthly Financial Summary Sheet */}
            <div className="tactile-card p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    AYNLYTICS Monthly Financial Report
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Generated locally on {todayIso()}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-xs font-mono font-semibold text-[var(--text-secondary)]">
                  {currency}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="tactile-well p-3">
                  <div className="text-[var(--text-muted)]">Net Worth</div>
                  <div className="text-base font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">
                    <Money
                      amount={reportKpis.totalNetWorth}
                      currency={currency}
                      privacyMask={privacyMask}
                    />
                  </div>
                </div>
                <div className="tactile-well p-3">
                  <div className="text-[var(--text-muted)]">Monthly Income</div>
                  <div
                    className="text-base font-bold mt-0.5 tabular-nums"
                    style={{ color: 'var(--accent-positive)' }}
                  >
                    <Money
                      amount={reportKpis.periodIncome}
                      currency={currency}
                      privacyMask={privacyMask}
                    />
                  </div>
                </div>
                <div className="tactile-well p-3">
                  <div className="text-[var(--text-muted)]">Monthly Expenses</div>
                  <div
                    className="text-base font-bold mt-0.5 tabular-nums"
                    style={{ color: 'var(--accent-danger)' }}
                  >
                    <Money
                      amount={reportKpis.periodExpenses}
                      currency={currency}
                      privacyMask={privacyMask}
                    />
                  </div>
                </div>
                <div className="tactile-well p-3">
                  <div className="text-[var(--text-muted)]">Savings Rate</div>
                  <div
                    className="text-base font-bold mt-0.5 tabular-nums"
                    style={{ color: 'var(--accent-primary-text)' }}
                  >
                    {reportKpis.savingsRate.toFixed(1)}%
                  </div>
                </div>
              </div>

              {reportTopCats.length > 0 && (
                <div className="pt-2">
                  <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
                    Top Monthly Spending Categories
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {reportTopCats.map((c) => (
                      <div
                        key={c.categoryId}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-hairline)]"
                      >
                        <span className="text-[var(--text-primary)] font-medium">
                          {c.categoryName}
                        </span>
                        <Money
                          amount={c.spent}
                          currency={currency}
                          privacyMask={privacyMask}
                          className="font-semibold text-[var(--text-primary)] tabular-nums"
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
          <div className="space-y-5" role="tabpanel" aria-label="Encrypted Vault Backup">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Create AES-256-GCM Backup */}
              <form
                onSubmit={handleEncryptedBackup}
                className="tactile-well p-5 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: 'var(--accent-positive-soft)',
                      color: 'var(--accent-positive)',
                    }}
                  >
                    <Lock className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Create Encrypted .vledger Backup
                  </h3>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Sealed with PBKDF2-SHA256 (120k iterations) + AES-256-GCM authenticated
                  encryption.
                </p>
                <div className="space-y-2.5">
                  <div>
                    <label
                      htmlFor="backup-enc-passphrase"
                      className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1"
                    >
                      Backup Passphrase
                    </label>
                    <div className="relative">
                      <input
                        id="backup-enc-passphrase"
                        type={showEncPassphrase ? 'text' : 'password'}
                        value={encPassphrase}
                        onChange={(e) => setEncPassphrase(e.target.value)}
                        placeholder="Min 6 characters"
                        required
                        className="tactile-input w-full pl-3 pr-9 py-2 text-xs focus:border-[var(--accent-primary)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEncPassphrase((v) => !v)}
                        aria-label={
                          showEncPassphrase ? 'Hide backup passphrase' : 'Show backup passphrase'
                        }
                        title={
                          showEncPassphrase ? 'Hide backup passphrase' : 'Show backup passphrase'
                        }
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                      >
                        {showEncPassphrase ? (
                          <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="backup-enc-confirm"
                      className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1"
                    >
                      Confirm Passphrase
                    </label>
                    <input
                      id="backup-enc-confirm"
                      type={showEncPassphrase ? 'text' : 'password'}
                      value={encConfirm}
                      onChange={(e) => setEncConfirm(e.target.value)}
                      placeholder="Re-enter passphrase"
                      required
                      className="tactile-input w-full px-3 py-2 text-xs focus:border-[var(--accent-primary)]"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={encrypting || !encPassphrase}
                  className="tactile-btn-primary w-full py-2.5 rounded-xl disabled:opacity-40 text-xs font-semibold cursor-pointer"
                >
                  {encrypting ? 'Encrypting...' : 'Encrypt & Download .vledger'}
                </button>
              </form>

              {/* Restore Backup */}
              <form
                onSubmit={handleExecuteRestore}
                className="tactile-well p-5 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: 'var(--accent-info-soft)',
                      color: 'var(--accent-info)',
                    }}
                  >
                    <Unlock className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Restore from .vledger or .json
                  </h3>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Move your vault seamlessly between Web and Desktop or recover from an archive.
                </p>

                <input
                  ref={restoreFileRef}
                  type="file"
                  accept=".vledger,.json"
                  onChange={handleRestoreFileSelected}
                  className="hidden"
                />
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Choose or drop a .vledger or .json backup file"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setRestoreDragOver(true);
                  }}
                  onDragLeave={() => setRestoreDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setRestoreDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) readRestoreFile(file);
                  }}
                  onClick={() => restoreFileRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      restoreFileRef.current?.click();
                    }
                  }}
                  className="w-full py-3 px-3 rounded-xl border border-dashed text-center text-xs font-semibold transition-colors cursor-pointer"
                  style={
                    restoreDragOver
                      ? {
                          borderColor: 'var(--accent-primary)',
                          background: 'var(--accent-primary-soft)',
                          color: 'var(--text-primary)',
                        }
                      : {
                          borderColor: 'var(--border-strong)',
                          background: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                        }
                  }
                >
                  {restoreFileName
                    ? `Selected: ${restoreFileName}`
                    : 'Choose or Drop .vledger / .json File'}
                </div>

                {restoreNeedsPassword && (
                  <div>
                    <label
                      htmlFor="backup-restore-passphrase"
                      className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1"
                    >
                      Decryption Passphrase
                    </label>
                    <div className="relative">
                      <input
                        id="backup-restore-passphrase"
                        type={showRestorePassphrase ? 'text' : 'password'}
                        value={restorePassphrase}
                        onChange={(e) => setRestorePassphrase(e.target.value)}
                        placeholder="Enter backup decryption passphrase"
                        required
                        className="tactile-input w-full pl-3 pr-9 py-2 text-xs focus:border-[var(--accent-primary)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRestorePassphrase((v) => !v)}
                        aria-label={
                          showRestorePassphrase
                            ? 'Hide decryption passphrase'
                            : 'Show decryption passphrase'
                        }
                        title={
                          showRestorePassphrase
                            ? 'Hide decryption passphrase'
                            : 'Show decryption passphrase'
                        }
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                      >
                        {showRestorePassphrase ? (
                          <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    !restoreRaw || restoring || (restoreNeedsPassword && !restorePassphrase)
                  }
                  className="tactile-btn-primary w-full py-2.5 rounded-xl disabled:opacity-40 text-xs font-semibold cursor-pointer"
                >
                  {restoring ? 'Restoring...' : 'Restore Vault'}
                </button>
              </form>
            </div>

            {/* Desktop Storage & Rolling Auto-Backups */}
            {isDesktop && (
              <div className="tactile-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-primary)]">
                      Desktop Local Vault &amp; Rolling Snapshots
                    </h4>
                    {storageInfo && (
                      <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5 truncate max-w-lg">
                        {storageInfo.vaultPath}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => window.vaultDesktop?.openDataFolder()}
                      className="tactile-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Open Folder</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await createManualBackup();
                        if (res.ok) {
                          showToast(`Snapshot created: ${res.fileName ?? 'backup'}`, 'success');
                          window.vaultDesktop
                            ?.listBackups()
                            .then(setDesktopBackups)
                            .catch(() => {});
                        }
                      }}
                      className="tactile-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Create Snapshot</span>
                    </button>
                  </div>
                </div>

                {desktopBackups.length > 0 && (
                  <div className="max-h-32 overflow-y-auto divide-y divide-[var(--border-hairline)] text-xs">
                    {desktopBackups.slice(0, 8).map((b) => (
                      <div key={b.fileName} className="py-1.5 flex items-center justify-between gap-3">
                        <span className="font-mono text-[var(--text-secondary)] truncate">
                          {b.fileName}
                        </span>
                        <span className="text-[var(--text-muted)] tabular-nums shrink-0">
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
