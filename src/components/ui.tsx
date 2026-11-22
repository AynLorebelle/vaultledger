import React, { useEffect } from 'react';
import {
  Home,
  Utensils,
  ShoppingCart,
  Car,
  Zap,
  Coffee,
  Film,
  Heart,
  Plane,
  Briefcase,
  DollarSign,
  PiggyBank,
  Laptop,
  Gift,
  Shield,
  GraduationCap,
  Smartphone,
  Dumbbell,
  Tag,
  Music,
  ShoppingBag,
  CreditCard,
  TrendingUp,
  Wifi,
  Repeat,
  Wallet,
  Building2,
  Target,
  Users,
  Trophy,
  X,
} from 'lucide-react';
import type { CurrencyCode } from '../types/finance';

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  PHP: '₱',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'A$',
  SGD: 'S$',
};

export function formatMoney(
  amount: number,
  currency: CurrencyCode = 'USD',
  opts?: { compact?: boolean; showSign?: boolean }
): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(safe);
  const sign = safe < 0 ? '-' : opts?.showSign && safe > 0 ? '+' : '';

  if (opts?.compact && abs >= 1000) {
    const sym = CURRENCY_SYMBOLS[currency] ?? '$';
    if (abs >= 1_000_000) {
      return `${sign}${sym}${(abs / 1_000_000).toFixed(2)}M`;
    }
    return `${sign}${sym}${(abs / 1000).toFixed(abs >= 10_000 ? 1 : 2)}k`;
  }

  try {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: currency === 'JPY' ? 0 : 2,
      maximumFractionDigits: currency === 'JPY' ? 0 : 2,
    }).format(abs);
    return `${sign}${formatted}`;
  } catch {
    const sym = CURRENCY_SYMBOLS[currency] ?? '$';
    return `${sign}${sym}${abs.toFixed(2)}`;
  }
}

interface MoneyProps {
  amount: number;
  currency: CurrencyCode;
  privacyMask: boolean;
  compact?: boolean;
  showSign?: boolean;
  className?: string;
}

export const Money: React.FC<MoneyProps> = ({
  amount,
  currency,
  privacyMask,
  compact,
  showSign,
  className = '',
}) => {
  return (
    <span className={`tabular-nums ${privacyMask ? 'privacy-blur' : ''} ${className}`}>
      {formatMoney(amount, currency, { compact, showSign })}
    </span>
  );
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  utensils: Utensils,
  'shopping-cart': ShoppingCart,
  shoppingcart: ShoppingCart,
  groceries: ShoppingCart,
  car: Car,
  transport: Car,
  zap: Zap,
  utilities: Zap,
  coffee: Coffee,
  film: Film,
  entertainment: Film,
  heart: Heart,
  health: Heart,
  plane: Plane,
  travel: Plane,
  briefcase: Briefcase,
  'dollar-sign': DollarSign,
  dollarsign: DollarSign,
  'piggy-bank': PiggyBank,
  piggybank: PiggyBank,
  laptop: Laptop,
  gift: Gift,
  shield: Shield,
  'graduation-cap': GraduationCap,
  graduationcap: GraduationCap,
  smartphone: Smartphone,
  dumbbell: Dumbbell,
  tag: Tag,
  music: Music,
  'shopping-bag': ShoppingBag,
  shoppingbag: ShoppingBag,
  'credit-card': CreditCard,
  creditcard: CreditCard,
  'trending-up': TrendingUp,
  trendingup: TrendingUp,
  wifi: Wifi,
  repeat: Repeat,
  wallet: Wallet,
  building: Building2,
  building2: Building2,
  target: Target,
  users: Users,
  trophy: Trophy,
};

export const CategoryIcon: React.FC<{
  icon?: string;
  className?: string;
}> = ({ icon, className = 'w-4 h-4' }) => {
  if (!icon) {
    return <Tag className={className} />;
  }
  const normalized = icon.trim().toLowerCase();
  const IconComp = ICON_MAP[normalized];
  if (IconComp) {
    return <IconComp className={className} />;
  }
  return <Tag className={className} />;
};

export const AVAILABLE_CATEGORY_ICONS = [
  { id: 'home', label: 'Housing' },
  { id: 'shopping-cart', label: 'Groceries' },
  { id: 'utensils', label: 'Dining' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'car', label: 'Transport' },
  { id: 'zap', label: 'Utilities' },
  { id: 'film', label: 'Entertainment' },
  { id: 'shopping-bag', label: 'Shopping' },
  { id: 'heart', label: 'Health' },
  { id: 'plane', label: 'Travel' },
  { id: 'piggy-bank', label: 'Savings' },
  { id: 'trending-up', label: 'Investing' },
  { id: 'briefcase', label: 'Salary' },
  { id: 'laptop', label: 'Freelance' },
  { id: 'smartphone', label: 'Tech' },
  { id: 'repeat', label: 'Subscriptions' },
  { id: 'gift', label: 'Gifts' },
  { id: 'dumbbell', label: 'Fitness' },
  { id: 'shield', label: 'Insurance' },
  { id: 'graduation-cap', label: 'Education' },
];

export interface ChartTheme {
  grid: string;
  tick: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipMuted: string;
  primary: string;
  primaryFill: string;
  secondary: string;
  positive: string;
  danger: string;
  warning: string;
  baseline: string;
}

export function getChartTheme(isDark: boolean): ChartTheme {
  if (isDark) {
    return {
      grid: '#3B3259',
      tick: '#C4B5FD',
      tooltipBg: '#2F2847',
      tooltipBorder: '#5B4B8A',
      tooltipText: '#F9FAFB',
      tooltipMuted: '#C4B5FD',
      primary: '#FDBCB4',
      primaryFill: 'rgba(253, 188, 180, 0.16)',
      secondary: '#ADD8E6',
      positive: '#98FF98',
      danger: '#FFD1DC',
      warning: '#FCD34D',
      baseline: '#C4B5FD',
    };
  }
  return {
    grid: '#DFD8F5',
    tick: '#4B5563',
    tooltipBg: '#FAF6FF',
    tooltipBorder: '#D8B4FE',
    tooltipText: '#1F2937',
    tooltipMuted: '#4B5563',
    primary: '#7C3AED',
    primaryFill: 'rgba(124, 58, 237, 0.14)',
    secondary: '#EC4899',
    positive: '#059669',
    danger: '#E11D48',
    warning: '#D97706',
    baseline: '#4B5563',
  };
}

export const PALETTE_COLORS = [
  '#EC4899',
  '#8B5CF6',
  '#10B981',
  '#0EA5E9',
  '#F97316',
  '#E11D48',
  '#6366F1',
  '#14B8A6',
  '#D97706',
  '#4B5563',
];

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-xl',
  children,
  headerRight,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Dialog'}
        className={`tactile-card-elevated vl-fade-up w-full ${maxWidthClass} max-h-[90vh] flex flex-col overflow-hidden`}
      >
        {(title || headerRight) && (
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-[var(--border-hairline)] shrink-0">
            <div>
              {title && (
                <h2 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {headerRight}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] border border-transparent hover:border-[var(--border-hairline)] transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};

export function formatShortDate(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return isoDate;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysUntil(isoDate: string): number {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3) return 0;
  const target = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
  return Math.round((target - todayStart) / (1000 * 60 * 60 * 24));
}
