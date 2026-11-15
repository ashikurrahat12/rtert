import React, { useMemo, useState } from 'react';
import { Search, Star, X, ArrowUpDown } from 'lucide-react';
import type { AssetCategory, AssetDefinition, MarketQuote } from '../types/trading.ts';
import { AssetIcon } from './AssetIcon.tsx';

interface AssetSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: AssetDefinition[];
  quotes: Record<string, MarketQuote>;
  selectedSymbol: string;
  favorites: string[];
  onToggleFavorite: (symbol: string) => void;
  onSelectAsset: (symbol: string) => void;
}

export const AssetSelectorModal: React.FC<AssetSelectorModalProps> = ({
  isOpen,
  onClose,
  assets,
  quotes,
  selectedSymbol,
  favorites,
  onToggleFavorite,
  onSelectAsset,
}) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | 'favorites' | AssetCategory>('all');
  const [sortBy, setSortBy] = useState<'payout' | 'change' | 'name'>('payout');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets
      .filter((a) => {
        if (category === 'favorites' && !favorites.includes(a.symbol)) return false;
        if (category !== 'all' && category !== 'favorites' && a.category !== category) return false;
        if (q && !a.symbol.toLowerCase().includes(q) && !a.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'payout') return b.payout - a.payout;
        if (sortBy === 'change') {
          const ca = Math.abs(quotes[a.symbol]?.changePct ?? 0);
          const cb = Math.abs(quotes[b.symbol]?.changePct ?? 0);
          return cb - ca;
        }
        return a.symbol.localeCompare(b.symbol);
      });
  }, [assets, category, favorites, quotes, search, sortBy]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-16 px-2 sm:px-4 bg-black/55 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] rounded-lg shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-[#2A3142]">
          <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
            Select Trading Instrument
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#252B3B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search + Category Tabs */}
        <div className="p-3 border-b border-slate-200 dark:border-[#2A3142] space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pair or asset (e.g. EUR/USD (OTC), USD/BDT, BTC, Gold)..."
              autoFocus
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142] rounded-md text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#2962FF]"
            />
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'otc', label: 'OTC (24/7)' },
                  { id: 'favorites', label: `Favorites (${favorites.length})` },
                  { id: 'crypto', label: 'Crypto' },
                  { id: 'forex', label: 'Forex' },
                  { id: 'commodities', label: 'Commodities' },
                  { id: 'stocks', label: 'Stocks' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setCategory(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    category === tab.id
                      ? 'bg-[#2962FF] text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252B3B]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setSortBy((s) => (s === 'payout' ? 'change' : s === 'change' ? 'name' : 'payout'))}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#252B3B] rounded"
            >
              <ArrowUpDown className="w-3 h-3" />
              <span>Sort: {sortBy === 'payout' ? 'Payout' : sortBy === 'change' ? '24h Move' : 'Name'}</span>
            </button>
          </div>
        </div>

        {/* Asset List Table */}
        <div className="flex-1 max-h-[65dvh] sm:max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-[#232938]">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              No matching trading pairs found.
            </div>
          ) : (
            filtered.map((asset) => {
              const q = quotes[asset.symbol];
              const isFav = favorites.includes(asset.symbol);
              const isSelected = asset.symbol === selectedSymbol;
              const chg = q?.changePct ?? 0;

              return (
                <div
                  key={asset.symbol}
                  onClick={() => {
                    onSelectAsset(asset.symbol);
                    onClose();
                  }}
                  className={`flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-[#2962FF]/15'
                      : 'hover:bg-slate-50 dark:hover:bg-[#232938]/70'
                  }`}
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(asset.symbol);
                      }}
                      className="text-slate-400 hover:text-amber-400 transition-colors shrink-0"
                      title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>
                    <AssetIcon
                      base={asset.baseCurrency}
                      quote={asset.quoteCurrency}
                      category={asset.category}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-semibold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                          {asset.symbol}
                        </span>
                        <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 truncate">
                          {asset.name}
                        </span>
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {asset.category.toUpperCase()} · {asset.marketHours === '24/7' ? '24/7 Live' : 'Exchange'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-5 shrink-0">
                    <div className="text-right">
                      <div className="font-mono-tabular text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                        {q ? q.price.toFixed(asset.decimals) : '--'}
                      </div>
                      <div
                        className={`font-mono-tabular text-[10px] sm:text-[11px] font-medium ${
                          chg >= 0 ? 'text-emerald-600 dark:text-[#0FAF59]' : 'text-rose-600 dark:text-[#FF4757]'
                        }`}
                      >
                        {chg >= 0 ? '+' : ''}
                        {chg.toFixed(2)}%
                      </div>
                    </div>

                    <div className="w-11 sm:w-16 text-right font-mono-tabular font-bold text-xs sm:text-sm text-amber-600 dark:text-amber-400">
                      {asset.payout}%
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
