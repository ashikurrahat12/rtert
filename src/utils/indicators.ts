import type { Candle } from '../types/trading.ts';

export function computeSMA(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (period <= 0 || candles.length < period) return result;
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) {
      sum -= candles[i - period].close;
    }
    if (i >= period - 1) {
      result[i] = sum / period;
    }
  }
  return result;
}

export function computeEMA(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (period <= 0 || candles.length < period) return result;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let ema = sum / period;
  result[period - 1] = ema;
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

export function computeBollingerBands(
  candles: Candle[],
  period = 20,
  mult = 2
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = computeSMA(candles, period);
  const upper: (number | null)[] = new Array(candles.length).fill(null);
  const lower: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = period - 1; i < candles.length; i++) {
    const mid = middle[i];
    if (mid === null) continue;
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = candles[j].close - mid;
      sqSum += diff * diff;
    }
    const std = Math.sqrt(sqSum / period);
    upper[i] = mid + mult * std;
    lower[i] = mid - mult * std;
  }
  return { upper, middle, lower };
}

export function computeRSI(candles: Candle[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length <= period) return result;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

export function computeMACD(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const emaFast = computeEMA(candles, fast);
  const emaSlow = computeEMA(candles, slow);
  const macd: (number | null)[] = new Array(candles.length).fill(null);
  const signal: (number | null)[] = new Array(candles.length).fill(null);
  const histogram: (number | null)[] = new Array(candles.length).fill(null);

  const validIndices: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macd[i] = (emaFast[i] as number) - (emaSlow[i] as number);
      validIndices.push(i);
    }
  }

  if (validIndices.length >= signalPeriod) {
    const k = 2 / (signalPeriod + 1);
    let sum = 0;
    for (let j = 0; j < signalPeriod; j++) {
      sum += macd[validIndices[j]] as number;
    }
    let sig = sum / signalPeriod;
    const firstIdx = validIndices[signalPeriod - 1];
    signal[firstIdx] = sig;
    histogram[firstIdx] = (macd[firstIdx] as number) - sig;

    for (let j = signalPeriod; j < validIndices.length; j++) {
      const idx = validIndices[j];
      const val = macd[idx] as number;
      sig = val * k + sig * (1 - k);
      signal[idx] = sig;
      histogram[idx] = val - sig;
    }
  }

  return { macd, signal, histogram };
}

export function computeStochastic(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3
): { k: (number | null)[]; d: (number | null)[] } {
  const k: (number | null)[] = new Array(candles.length).fill(null);
  const d: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = kPeriod - 1; i < candles.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > highest) highest = candles[j].high;
      if (candles[j].low < lowest) lowest = candles[j].low;
    }
    const range = highest - lowest;
    k[i] = range === 0 ? 50 : ((candles[i].close - lowest) / range) * 100;
  }

  for (let i = kPeriod - 1 + dPeriod - 1; i < candles.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      if (k[j] !== null) {
        sum += k[j] as number;
        count++;
      }
    }
    if (count === dPeriod) d[i] = sum / dPeriod;
  }

  return { k, d };
}

export function toHeikinAshi(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const ha: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = i === 0 ? (c.open + c.close) / 2 : (ha[i - 1].open + ha[i - 1].close) / 2;
    const high = Math.max(c.high, open, close);
    const low = Math.min(c.low, open, close);
    ha.push({ time: c.time, open, high, low, close, volume: c.volume });
  }
  return ha;
}

export interface TechnicalSummary {
  signal: 'STRONG BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG SELL';
  rsi: number | null;
  emaFast: number | null;
  emaSlow: number | null;
  macdHist: number | null;
  score: number; // -3 to +3
}

export function computeTechnicalSignal(candles: Candle[]): TechnicalSummary {
  if (candles.length < 30) {
    return { signal: 'NEUTRAL', rsi: null, emaFast: null, emaSlow: null, macdHist: null, score: 0 };
  }
  const rsiArr = computeRSI(candles, 14);
  const ema9 = computeEMA(candles, 9);
  const ema21 = computeEMA(candles, 21);
  const macdObj = computeMACD(candles, 12, 26, 9);

  const last = candles.length - 1;
  const rsi = rsiArr[last];
  const e9 = ema9[last];
  const e21 = ema21[last];
  const hist = macdObj.histogram[last];

  let score = 0;
  if (rsi !== null) {
    if (rsi < 35) score += 1;
    else if (rsi > 65) score -= 1;
    else if (rsi > 52) score += 0.5;
    else if (rsi < 48) score -= 0.5;
  }
  if (e9 !== null && e21 !== null) {
    if (e9 > e21) score += 1;
    else if (e9 < e21) score -= 1;
  }
  if (hist !== null) {
    if (hist > 0) score += 1;
    else if (hist < 0) score -= 1;
  }

  let signal: TechnicalSummary['signal'] = 'NEUTRAL';
  if (score >= 2) signal = 'STRONG BUY';
  else if (score >= 0.75) signal = 'BUY';
  else if (score <= -2) signal = 'STRONG SELL';
  else if (score <= -0.75) signal = 'SELL';

  return {
    signal,
    rsi,
    emaFast: e9,
    emaSlow: e21,
    macdHist: hist,
    score,
  };
}
