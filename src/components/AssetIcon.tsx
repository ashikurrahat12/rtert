import React from 'react';
import type { AssetCategory } from '../types/trading.ts';

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  BTC: { bg: '#F7931A', text: '#FFFFFF' },
  ETH: { bg: '#627EEA', text: '#FFFFFF' },
  SOL: { bg: '#14F195', text: '#0F172A' },
  XRP: { bg: '#25A768', text: '#FFFFFF' },
  BNB: { bg: '#F3BA2F', text: '#0F172A' },
  ADA: { bg: '#0033AD', text: '#FFFFFF' },
  DOGE: { bg: '#C2A633', text: '#FFFFFF' },
  AVAX: { bg: '#E84142', text: '#FFFFFF' },
  LINK: { bg: '#2A5ADA', text: '#FFFFFF' },
  LTC: { bg: '#345D9D', text: '#FFFFFF' },
  XAU: { bg: '#EAB308', text: '#0F172A' },
  XAG: { bg: '#94A3B8', text: '#0F172A' },
  WTI: { bg: '#334155', text: '#FFFFFF' },
  EUR: { bg: '#1D4ED8', text: '#FFFFFF' },
  USD: { bg: '#059669', text: '#FFFFFF' },
  GBP: { bg: '#7C3AED', text: '#FFFFFF' },
  JPY: { bg: '#DC2626', text: '#FFFFFF' },
  AUD: { bg: '#0284C7', text: '#FFFFFF' },
  NZD: { bg: '#0F172A', text: '#FFFFFF' },
  CAD: { bg: '#E11D48', text: '#FFFFFF' },
  CHF: { bg: '#B91C1C', text: '#FFFFFF' },
  BRL: { bg: '#16A34A', text: '#FFFFFF' },
  MXN: { bg: '#15803D', text: '#FFFFFF' },
  NGN: { bg: '#047857', text: '#FFFFFF' },
  BDT: { bg: '#065F46', text: '#FFFFFF' },
  IDR: { bg: '#EA580C', text: '#FFFFFF' },
  ARS: { bg: '#0EA5E9', text: '#FFFFFF' },
  DZD: { bg: '#10B981', text: '#FFFFFF' },
  PKR: { bg: '#166534', text: '#FFFFFF' },
  ZAR: { bg: '#CA8A04', text: '#FFFFFF' },
  COP: { bg: '#EAB308', text: '#0F172A' },
  EGP: { bg: '#991B1B', text: '#FFFFFF' },
  PHP: { bg: '#2563EB', text: '#FFFFFF' },
  AAPL: { bg: '#1E293B', text: '#FFFFFF' },
  TSLA: { bg: '#DC2626', text: '#FFFFFF' },
  NVDA: { bg: '#16A34A', text: '#FFFFFF' },
  MSFT: { bg: '#0284C7', text: '#FFFFFF' },
};

export const AssetIcon: React.FC<{
  base: string;
  quote: string;
  category: AssetCategory;
  size?: 'sm' | 'md';
}> = ({ base, quote, category, size = 'sm' }) => {
  const baseStyle = COLOR_MAP[base] || { bg: '#2962FF', text: '#FFFFFF' };
  const quoteStyle = COLOR_MAP[quote] || { bg: '#0FAF59', text: '#FFFFFF' };
  const dim = size === 'sm' ? 'w-5 h-5 text-[8px]' : 'w-6 h-6 text-[9px]';

  if (category === 'stocks') {
    return (
      <div
        className={`${dim} rounded-full flex items-center justify-center font-mono-tabular font-bold shrink-0 ring-1 ring-white/15`}
        style={{ backgroundColor: baseStyle.bg, color: baseStyle.text }}
      >
        {base.slice(0, 2)}
      </div>
    );
  }

  return (
    <div className="flex items-center shrink-0">
      <div
        className={`${dim} rounded-full flex items-center justify-center font-mono-tabular font-bold ring-1 ring-[#131722] z-10`}
        style={{ backgroundColor: baseStyle.bg, color: baseStyle.text }}
      >
        {base.slice(0, 2)}
      </div>
      <div
        className={`${dim} -ml-1.5 rounded-full flex items-center justify-center font-mono-tabular font-bold ring-1 ring-[#131722]`}
        style={{ backgroundColor: quoteStyle.bg, color: quoteStyle.text }}
      >
        {quote.slice(0, 2)}
      </div>
    </div>
  );
};
