import React, { useRef, useState } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  Delete,
  Grid3x3,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';

const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export const VaultLockScreen: React.FC = () => {
  const unlockVault = useFinanceStore((s) => s.unlockVault);
  const storageMode = useFinanceStore((s) => s.storageMode);
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
        inputRef.current?.focus();
      }
    } catch {
      setError('Unable to verify passcode. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDigitPress = (digit: string) => {
    if (submitting) return;
    setPasscode((prev) => prev + digit);
    if (error) setError(null);
  };

  const handleBackspace = () => {
    if (submitting) return;
    setPasscode((prev) => prev.slice(0, -1));
    if (error) setError(null);
  };

  const handleClear = () => {
    if (submitting) return;
    setPasscode('');
    if (error) setError(null);
    inputRef.current?.focus();
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <div className="tactile-card-elevated vl-fade-up w-full max-w-md p-6 sm:p-7">
        <div className="flex flex-col items-center text-center">
          <div
            className="w-14 h-14 rounded-2xl border flex items-center justify-center mb-4"
            style={{
              backgroundColor: 'var(--accent-primary-soft)',
              borderColor: 'var(--border-hairline)',
              color: 'var(--accent-primary-text)',
            }}
          >
            <Lock className="w-6 h-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            AYNLYTICS is Locked
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1.5 max-w-xs leading-relaxed">
            Enter your local passcode to unlock your AYNLYTICS personal finance vault.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="vault-passcode"
                className="block text-xs font-semibold text-[var(--text-secondary)]"
              >
                Vault Passcode
              </label>
              <button
                type="button"
                onClick={() => setShowKeypad((v) => !v)}
                aria-expanded={showKeypad}
                aria-label={showKeypad ? 'Hide numeric PIN keypad' : 'Show numeric PIN keypad'}
                className="inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer rounded-md px-1.5 py-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors"
              >
                <Grid3x3 className="w-3 h-3" aria-hidden="true" />
                <span>{showKeypad ? 'Hide Keypad' : 'PIN Keypad'}</span>
              </button>
            </div>

            <div className="relative">
              <input
                ref={inputRef}
                id="vault-passcode"
                type={showPasscode ? 'text' : 'password'}
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (error) setError(null);
                }}
                autoFocus
                autoComplete="current-password"
                placeholder="Enter passcode..."
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'vault-lock-error' : undefined}
                className="tactile-input w-full px-3.5 py-2.5 pr-10 text-sm placeholder:text-[var(--text-muted)] transition-colors"
                style={
                  error
                    ? { borderColor: 'var(--accent-danger)' }
                    : undefined
                }
              />
              <button
                type="button"
                onClick={() => setShowPasscode((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                aria-label={showPasscode ? 'Hide passcode' : 'Show passcode'}
              >
                {showPasscode ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {showKeypad && (
            <div
              role="group"
              aria-label="Numeric PIN keypad"
              className="tactile-well p-2.5 grid grid-cols-3 gap-2"
            >
              {KEYPAD_DIGITS.map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigitPress(digit)}
                  aria-label={`Digit ${digit}`}
                  className="tactile-btn py-2.5 rounded-xl text-sm font-semibold tabular-nums cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear passcode"
                className="tactile-btn py-2.5 rounded-xl text-xs font-semibold text-[var(--text-secondary)] cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handleDigitPress('0')}
                aria-label="Digit 0"
                className="tactile-btn py-2.5 rounded-xl text-sm font-semibold tabular-nums cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                aria-label="Delete last character"
                className="tactile-btn py-2.5 rounded-xl flex items-center justify-center text-[var(--text-secondary)] cursor-pointer"
              >
                <Delete className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {error && (
            <div
              id="vault-lock-error"
              role="alert"
              className="flex items-center gap-2 text-xs font-medium rounded-xl px-3 py-2.5 border"
              style={{
                backgroundColor: 'var(--accent-danger-soft)',
                borderColor: 'var(--accent-danger)',
                color: 'var(--accent-danger)',
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!passcode.trim() || submitting}
            aria-label="Unlock Vault"
            className="tactile-btn-primary w-full flex items-center justify-center gap-2 rounded-xl font-semibold text-sm py-2.5 px-4 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>{submitting ? 'Unlocking…' : 'Unlock Vault'}</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[var(--border-hairline)] flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
          <ShieldCheck
            className="w-4 h-4 shrink-0"
            style={{ color: 'var(--accent-positive)' }}
            aria-hidden="true"
          />
          <span>
            100% Local · {storageMode === 'desktop' ? 'Desktop Vault' : 'Browser IndexedDB'} · Zero Cloud Sync
          </span>
        </div>
      </div>
    </div>
  );
};
