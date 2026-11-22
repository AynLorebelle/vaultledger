import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, ArrowRight, AlertCircle } from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';

export const VaultLockScreen: React.FC = () => {
  const unlockVault = useFinanceStore((s) => s.unlockVault);
  const storageMode = useFinanceStore((s) => s.storageMode);
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const ok = await unlockVault(passcode);
      if (!ok) {
        setError('Incorrect vault passcode. Please try again.');
        setPasscode('');
      }
    } catch {
      setError('Unable to verify passcode. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 text-slate-100 relative overflow-hidden">
      {/* Subtle ambient obsidian glow */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 rounded-full bg-indigo-600/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-emerald-600/10 blur-3xl" />

      <div className="relative z-10 w-full max-w-md rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-slate-800/90 shadow-2xl p-7">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-indigo-400" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            VaultLedger is Locked
          </h1>
          <p className="text-sm text-slate-400 mt-1.5 max-w-xs">
            Enter your local passcode to unlock your personal finance vault.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="vault-passcode"
              className="block text-xs font-medium text-slate-400 mb-1.5"
            >
              Vault Passcode
            </label>
            <div className="relative">
              <input
                id="vault-passcode"
                type={showPasscode ? 'text' : 'password'}
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (error) setError(null);
                }}
                autoFocus
                placeholder="Enter passcode..."
                className="w-full rounded-xl bg-slate-950/90 border border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 px-3.5 py-2.5 pr-10 text-sm text-white placeholder-slate-500 outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPasscode((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                aria-label={showPasscode ? 'Hide passcode' : 'Show passcode'}
              >
                {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!passcode.trim() || submitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-2.5 px-4 transition-colors cursor-pointer"
          >
            <span>{submitting ? 'Unlocking...' : 'Unlock Vault'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>
            100% Local · {storageMode === 'desktop' ? 'Desktop Vault' : 'Browser IndexedDB'} · Zero Cloud Sync
          </span>
        </div>
      </div>
    </div>
  );
};
