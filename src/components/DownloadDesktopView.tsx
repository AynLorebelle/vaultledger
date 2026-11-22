import React, { useEffect, useMemo, useState } from 'react';
import {
  Monitor,
  Download,
  FolderOpen,
  HardDrive,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  KeyRound,
  Laptop,
  Apple,
  Terminal,
  ArrowRight,
  WifiOff,
  Lock,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  assets: GitHubAsset[];
}

type DetectedOS = 'windows' | 'macos' | 'linux' | 'unknown';

function detectUserOS(): DetectedOS {
  const ua = (navigator.userAgent || '').toLowerCase();
  const plat = (navigator.platform || '').toLowerCase();
  if (ua.includes('win') || plat.includes('win')) return 'windows';
  if (ua.includes('mac') || plat.includes('mac')) return 'macos';
  if (ua.includes('linux') || plat.includes('linux')) return 'linux';
  return 'unknown';
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

const RELEASES_PAGE = 'https://github.com/AynLorebelle/vaultledger/releases';
const RELEASES_API = 'https://api.github.com/repos/AynLorebelle/vaultledger/releases/latest';

export const DownloadDesktopView: React.FC = () => {
  const openImportExport = useFinanceStore((s) => s.openImportExport);
  const createManualBackup = useFinanceStore((s) => s.createManualBackup);
  const showToast = useFinanceStore((s) => s.showToast);

  const isDesktop = Boolean(window.vaultDesktop?.isDesktop);
  const desktopVersion = window.vaultDesktop?.appVersion ?? '2.0.0';
  const detectedOS = useMemo(() => detectUserOS(), []);

  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [releaseStatus, setReleaseStatus] = useState<'loading' | 'loaded' | 'offline'>('loading');
  const [storageInfo, setStorageInfo] = useState<{
    vaultPath: string;
    backupsDir: string;
    receiptsDir: string;
  } | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    let active = true;
    if (window.vaultDesktop?.getStorageInfo) {
      window.vaultDesktop
        .getStorageInfo()
        .then((info) => {
          if (active) setStorageInfo(info);
        })
        .catch(() => {});
    }

    fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
      .then((res) => {
        if (!res.ok) throw new Error('No release');
        return res.json() as Promise<GitHubRelease>;
      })
      .then((data) => {
        if (active) {
          setRelease(data);
          setReleaseStatus('loaded');
        }
      })
      .catch(() => {
        if (active) setReleaseStatus('offline');
      });

    return () => {
      active = false;
    };
  }, []);

  const resolvedAssets = useMemo(() => {
    const assets = release?.assets ?? [];
    const findAsset = (pred: (name: string) => boolean) =>
      assets.find((a) => pred(a.name.toLowerCase()));

    const winInstaller = findAsset(
      (n) => n.endsWith('.exe') && (n.includes('nsis') || n.includes('setup') || !n.includes('portable'))
    );
    const winPortable = findAsset((n) => n.endsWith('.exe') && n.includes('portable'));
    const macDmg = findAsset((n) => n.endsWith('.dmg'));
    const linuxAppImage = findAsset((n) => n.endsWith('.appimage'));

    return {
      version: release?.tag_name ?? 'v2.0.0',
      winInstaller,
      winPortable,
      macDmg,
      linuxAppImage,
    };
  }, [release]);

  const handleOpenDataFolder = async () => {
    try {
      await window.vaultDesktop?.openDataFolder();
    } catch {
      showToast('Could not open local data folder', 'error');
    }
  };

  const handleSnapshot = async () => {
    setBackingUp(true);
    try {
      const res = await createManualBackup();
      if (res.ok) {
        showToast(`Local snapshot saved (${res.fileName ?? 'backup'})`, 'success');
      } else {
        showToast('Unable to save local snapshot', 'error');
      }
    } finally {
      setBackingUp(false);
    }
  };

  const downloadCards = [
    {
      id: 'win-nsis',
      os: 'windows' as DetectedOS,
      title: 'Windows Installer',
      subtitle: 'NSIS Setup (.exe) · Start Menu & Desktop Shortcut',
      badge: 'Recommended for Windows',
      icon: Monitor,
      asset: resolvedAssets.winInstaller,
      fallbackLabel: 'Download .exe Installer',
    },
    {
      id: 'win-portable',
      os: 'windows' as DetectedOS,
      title: 'Windows Portable',
      subtitle: 'Standalone (.exe) · Run from USB or any folder',
      badge: 'Zero Install',
      icon: HardDrive,
      asset: resolvedAssets.winPortable,
      fallbackLabel: 'Download Portable .exe',
    },
    {
      id: 'mac-dmg',
      os: 'macos' as DetectedOS,
      title: 'macOS Desktop',
      subtitle: 'Universal Disk Image (.dmg) · Drag to Applications',
      badge: 'macOS',
      icon: Apple,
      asset: resolvedAssets.macDmg,
      fallbackLabel: 'Download .dmg',
    },
    {
      id: 'linux-appimage',
      os: 'linux' as DetectedOS,
      title: 'Linux Desktop',
      subtitle: 'Portable AppImage (.AppImage) · Works on any distro',
      badge: 'Linux',
      icon: Terminal,
      asset: resolvedAssets.linuxAppImage,
      fallbackLabel: 'Download .AppImage',
    },
  ];

  const capabilityBadges = [
    { icon: WifiOff, label: '100% Airplane-Mode Ready', clayClass: 'clay-surface-peach' },
    { icon: HardDrive, label: 'Direct Local Disk Storage', clayClass: 'clay-surface-mint' },
    { icon: RefreshCw, label: 'Automatic Rolling Backups', clayClass: 'clay-surface-blue' },
    { icon: Lock, label: 'AES-256-GCM Encrypted Snapshots', clayClass: 'clay-surface-peach' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      {isDesktop ? (
        <div className="tactile-card border-l-4 border-l-[var(--accent-positive)] p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="clay-surface-mint inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Native Desktop App Active</span>
                </span>
                <span className="clay-surface-peach inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold">
                  <span>AYNLYTICS v1.1.0 Desktop &amp; Offline Edition</span>
                </span>
                <span className="clay-surface-blue inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold">
                  <span>3D Claymorphism UI</span>
                </span>
              </div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight tabular-nums">
                You&apos;re running AYNLYTICS Desktop v{desktopVersion} — 100% Offline
              </h1>
              <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
                Your financial ledger, Friend Savings Squads, receipts, and rolling snapshots are stored directly on your local disk with zero third-party cloud dependencies.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleOpenDataFolder}
                className="tactile-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Open Vault Folder</span>
              </button>
              <button
                type="button"
                onClick={handleSnapshot}
                disabled={backingUp}
                className="tactile-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${backingUp ? 'animate-spin' : ''}`} />
                <span>{backingUp ? 'Saving...' : 'Create Local Snapshot'}</span>
              </button>
            </div>
          </div>

          {storageInfo && (
            <div className="mt-5 pt-4 border-t border-[var(--border-hairline)] grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="tactile-well p-3">
                <div className="text-[var(--text-muted)] font-semibold uppercase tracking-wider text-[10px]">
                  AYNLYTICS Vault File
                </div>
                <div
                  className="mt-1 font-mono text-[var(--text-primary)] truncate"
                  title={storageInfo.vaultPath}
                >
                  {storageInfo.vaultPath}
                </div>
              </div>
              <div className="tactile-well p-3">
                <div className="text-[var(--text-muted)] font-semibold uppercase tracking-wider text-[10px]">
                  Auto-Backup Folder
                </div>
                <div
                  className="mt-1 font-mono text-[var(--text-primary)] truncate"
                  title={storageInfo.backupsDir}
                >
                  {storageInfo.backupsDir}
                </div>
              </div>
              <div className="tactile-well p-3">
                <div className="text-[var(--text-muted)] font-semibold uppercase tracking-wider text-[10px]">
                  Receipts Storage
                </div>
                <div
                  className="mt-1 font-mono text-[var(--text-primary)] truncate"
                  title={storageInfo.receiptsDir}
                >
                  {storageInfo.receiptsDir}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="tactile-card border-l-4 border-l-[var(--accent-primary)] p-6 md:p-7">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="clay-surface-peach inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold tabular-nums">
                  <Laptop className="w-3.5 h-3.5" />
                  <span>AYNLYTICS v1.1.0 Desktop &amp; Offline Edition</span>
                </span>
                <span className="clay-surface-mint inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold tabular-nums">
                  <span>
                    {resolvedAssets.version}
                    {detectedOS !== 'unknown' && ` · Detected ${detectedOS.toUpperCase()}`}
                  </span>
                </span>
                <span className="clay-surface-blue inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold">
                  <span>3D Claymorphism + Friend Squads</span>
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] tracking-tight">
                Download AYNLYTICS for Desktop
              </h1>
              <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
                Keep your entire financial life and Friend Savings Squads in a rock-solid local file on your computer. No browser storage eviction, native file dialogs, automatic rolling backups, and 100% airplane-mode operation.
              </p>
            </div>
            <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
              <a
                href={release?.html_url ?? RELEASES_PAGE}
                target="_blank"
                rel="noopener noreferrer"
                className="tactile-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              >
                <Download className="w-4 h-4" />
                <span>View GitHub Releases</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-85" />
              </a>
              <span className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 tabular-nums">
                {releaseStatus === 'offline' ? (
                  <>
                    <WifiOff className="w-3.5 h-3.5" />
                    Offline mode · Links point to GitHub Releases
                  </>
                ) : releaseStatus === 'loaded' ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent-positive)' }} />
                    Latest release {resolvedAssets.version} ready
                  </>
                ) : (
                  'Checking latest release...'
                )}
              </span>
            </div>
          </div>

          {/* Offline Capability Badges */}
          <div className="mt-5 pt-4 border-t border-[var(--border-hairline)] flex flex-wrap gap-2.5">
            {capabilityBadges.map((cap) => {
              const CapIcon = cap.icon;
              return (
                <span
                  key={cap.label}
                  className={`${cap.clayClass} inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold`}
                >
                  <CapIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>{cap.label}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Platform Download Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {downloadCards.map((card) => {
          const Icon = card.icon;
          const isDetected = card.os === detectedOS && card.id !== 'win-portable';
          const href = card.asset?.browser_download_url ?? release?.html_url ?? RELEASES_PAGE;
          const sizeStr = card.asset ? formatBytes(card.asset.size) : '';

          return (
            <div
              key={card.id}
              className={`tactile-card p-5 transition-colors flex flex-col justify-between gap-4 ${
                isDetected ? 'border-l-4 border-l-[var(--accent-primary)]' : ''
              }`}
              style={
                isDetected ? { borderColor: 'var(--accent-primary)' } : undefined
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-[var(--border-hairline)]"
                    style={
                      isDetected
                        ? {
                            backgroundColor: 'var(--accent-primary-soft)',
                            color: 'var(--accent-primary-text)',
                          }
                        : {
                            backgroundColor: 'var(--bg-subtle)',
                            color: 'var(--text-secondary)',
                          }
                    }
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        {card.title}
                      </h3>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={
                          isDetected
                            ? {
                                backgroundColor: 'var(--accent-primary-soft)',
                                color: 'var(--accent-primary-text)',
                              }
                            : {
                                backgroundColor: 'var(--bg-subtle)',
                                color: 'var(--text-muted)',
                              }
                        }
                      >
                        {isDetected ? 'Recommended' : card.badge}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {card.subtitle}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-hairline)]">
                <span className="text-xs text-[var(--text-muted)] tabular-nums truncate">
                  {card.asset
                    ? `${card.asset.name}${sizeStr ? ` · ${sizeStr}` : ''}`
                    : `${resolvedAssets.version} · Open Releases`}
                </span>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 ${
                    isDetected ? 'tactile-btn-primary' : 'tactile-btn'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{card.asset ? 'Download' : card.fallbackLabel}</span>
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* Web to Desktop 10-Second Migration Guide */}
      <div className="tactile-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <KeyRound className="w-4 h-4" style={{ color: 'var(--accent-primary-text)' }} />
              <span>Move your data from Web to Desktop in 10 seconds</span>
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Encrypted with AES-256-GCM + PBKDF2 so your vault file is safe even on a thumb drive.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openImportExport('backup')}
            className="tactile-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold shrink-0 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Export .vledger Backup</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              step: '01',
              title: 'Export Encrypted Vault',
              desc: 'Click "Export .vledger Backup" above and protect your snapshot with a passphrase.',
            },
            {
              step: '02',
              title: 'Install AYNLYTICS Desktop',
              desc: 'Run the Windows, macOS, or Linux desktop app. No account creation or login required.',
            },
            {
              step: '03',
              title: 'Restore Locally',
              desc: 'Open Import/Export → Encrypted Backup in the desktop app and select your .vledger file.',
            },
          ].map((item) => (
            <div key={item.step} className="tactile-well p-4">
              <span
                className="text-[11px] font-bold font-mono tabular-nums"
                style={{ color: 'var(--accent-primary-text)' }}
              >
                STEP {item.step}
              </span>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mt-1">
                {item.title}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
