"use client";

/**
 * Candlestick chart of real market data (TradingView Lightweight Charts): zoom and pan with the wheel /
 * pinch / drag, crosshair with the candle's open-high-low-close, volume bars, current-price line, and
 * optional moving averages, VWAP, RSI and MACD (worked out from the same candles). Gaps in the data
 * stay gaps — nothing is filled in.
 */
import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ema, macd, rsi, sma, vwap } from "@/lib/training/candles";
import type { Candle } from "@/lib/sim/store";

export type Indicator = "ma20" | "ma50" | "ema20" | "vwap" | "rsi" | "macd";
export const INDICATORS: { id: Indicator; label: string; intraday?: boolean }[] = [
  { id: "ma20", label: "MA 20" },
  { id: "ma50", label: "MA 50" },
  { id: "ema20", label: "EMA 20" },
  { id: "vwap", label: "VWAP", intraday: true },
  { id: "rsi", label: "RSI" },
  { id: "macd", label: "MACD" },
];

const IST = 19800; // the chart shows times as UTC, so shift to India time
const css = (name: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

export function PriceChart({ candles, intraday, indicators, lastPrice, height = 360 }: { candles: Candle[]; intraday: boolean; indicators: Indicator[]; lastPrice?: number | null; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [hover, setHover] = useState<Candle | null>(null);
  const [theme, setTheme] = useState(0);

  // Redraw colours when the light/dark theme changes.
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setTheme((t) => t + 1);
    mq.addEventListener("change", on);
    return () => (mo.disconnect(), mq.removeEventListener("change", on));
  }, []);

  const data = useMemo(() => {
    const t = (c: Candle) => (c[0] + IST) as UTCTimestamp;
    const closes = candles.map((c) => c[4]);
    const asCandle = candles.map((c) => ({ time: t(c), open: c[1], high: c[2], low: c[3], close: c[4] }));
    const line = (s: (number | null)[]) => s.flatMap((v, i) => (v == null || !Number.isFinite(v) ? [] : [{ time: t(candles[i]), value: v }]));
    const m = macd(closes);
    // VWAP restarts each trading day.
    const vw: (number | null)[] = [];
    let start = 0;
    for (let i = 0; i <= candles.length; i++) {
      const day = (c?: Candle) => (c ? new Date((c[0] + IST) * 1000).toISOString().slice(0, 10) : "");
      if (i === candles.length || (i > 0 && day(candles[i]) !== day(candles[i - 1]))) {
        vw.push(...vwap(candles.slice(start, i).map((c) => ({ t: c[0], o: c[1], h: c[2], l: c[3], c: c[4], v: c[5] }))));
        start = i;
      }
    }
    return {
      candles: asCandle,
      volume: candles.map((c) => ({ time: t(c), value: c[5], color: c[4] >= c[1] ? "up" : "down" })),
      ma20: line(sma(closes, 20)),
      ma50: line(sma(closes, 50)),
      ema20: line(ema(closes, 20)),
      vwap: line(vw),
      rsi: line(rsi(closes)),
      macd: line(m.macd),
      signal: line(m.signal),
      hist: m.hist.flatMap((v, i) => (v == null ? [] : [{ time: t(candles[i]), value: v, color: v >= 0 ? "up" : "down" }])),
    };
  }, [candles]);

  useEffect(() => {
    const el = box.current;
    if (!el || !candles.length) return;
    const up = css("--candle-up", "#0f7d5f");
    const down = css("--candle-down", "#ef6a3f");
    const ink3 = css("--ink-3", "#6f7c76");
    const line = css("--line", "#d8dfd9");
    const fade = (c: string) => (c.startsWith("#") && c.length === 7 ? `${c}80` : c);
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: ink3, fontSize: 11, attributionLogo: false, panes: { separatorColor: line } },
      grid: { vertLines: { color: line + "55" }, horzLines: { color: line + "55" } },
      rightPriceScale: { borderColor: line },
      timeScale: { borderColor: line, timeVisible: intraday, secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { priceFormatter: (p: number) => p.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
    });
    chartRef.current = chart;
    const cs = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
    cs.setData(data.candles);
    if (lastPrice) cs.createPriceLine({ price: lastPrice, color: ink3, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "Now" });
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(data.volume.map((v) => ({ ...v, color: v.color === "up" ? fade(up) : fade(down) })));
    const overlay = (pts: { time: UTCTimestamp; value: number }[], color: string, pane = 0, width: 1 | 2 = 2): ISeriesApi<"Line"> => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pane);
      s.setData(pts);
      return s;
    };
    if (indicators.includes("ma20")) overlay(data.ma20, css("--chart-in", "#1f7fa8"));
    if (indicators.includes("ma50")) overlay(data.ma50, css("--future", "#6a4fd8"));
    if (indicators.includes("ema20")) overlay(data.ema20, "#d97706");
    if (indicators.includes("vwap") && intraday) overlay(data.vwap, "#c026d3");
    let pane = 1;
    if (indicators.includes("rsi")) {
      const r = overlay(data.rsi, css("--future", "#6a4fd8"), pane, 1);
      r.createPriceLine({ price: 70, color: ink3, lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: "" });
      r.createPriceLine({ price: 30, color: ink3, lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: "" });
      pane++;
    }
    if (indicators.includes("macd")) {
      const h = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
      h.setData(data.hist.map((x) => ({ ...x, color: x.color === "up" ? fade(up) : fade(down) })));
      overlay(data.macd, css("--chart-in", "#1f7fa8"), pane, 1);
      overlay(data.signal, "#d97706", pane, 1);
    }
    const panes = chart.panes();
    panes.forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));
    chart.timeScale().fitContent();
    const byTime = new Map(candles.map((c) => [c[0] + IST, c]));
    chart.subscribeCrosshairMove((p) => setHover(p.time != null ? byTime.get(Number(p.time)) ?? null : null));
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, candles, intraday, indicators, lastPrice, theme]);

  const last = candles.at(-1);
  const shown = hover ?? last;
  const f = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const extra = indicators.filter((i) => i === "rsi" || i === "macd").length;
  return (
    <div>
      <div className="num mb-1 flex min-h-[20px] flex-wrap gap-x-3 text-[12px] text-ink-3">
        {shown && (
          <>
            <span>{new Date((shown[0] + IST) * 1000).toISOString().slice(0, intraday ? 16 : 10).replace("T", " ")}</span>
            <span>O <b className="font-medium text-ink">{f(shown[1])}</b></span>
            <span>H <b className="font-medium text-ink">{f(shown[2])}</b></span>
            <span>L <b className="font-medium text-ink">{f(shown[3])}</b></span>
            <span>C <b className={cn("font-medium", shown[4] >= shown[1] ? "text-ok" : "text-danger")}>{f(shown[4])}</b></span>
            <span>Vol <b className="font-medium text-ink">{shown[5].toLocaleString("en-IN")}</b></span>
          </>
        )}
      </div>
      <div ref={box} style={{ height: height + extra * 110 }} className="w-full touch-pan-y" aria-label="Price chart" role="img" />
    </div>
  );
}
