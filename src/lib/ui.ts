"use client";

import { create } from "zustand";
import type { LifeItem, LifeKind, Transaction } from "./types";

export type EditorKind =
  | "account"
  | "card"
  | "statement"
  | "loan"
  | "chit"
  | "investment"
  | "goal"
  | "lending"
  | "reserve"
  | "rule"
  | "valuation";

export interface EditorState {
  kind: EditorKind;
  id?: string;
  preset?: Record<string, unknown>;
}

interface UIState {
  txOpen: boolean;
  txPreset: Partial<Transaction> | null;
  txEditing: Transaction | null;
  quickOpen: boolean;
  eventKey: string | null;
  /** Open the event sheet straight on its "mark paid" form. */
  eventMode: "view" | "settle";
  /** Task / checklist / note / reminder / wishlist editor. */
  life: { kind: LifeKind; id?: string; preset?: Partial<LifeItem> } | null;
  /** Chit whose installment table is open. */
  chitSheet: string | null;
  editor: EditorState | null;
  palette: boolean;
  alerts: boolean;
  openTx(preset?: Partial<Transaction> | null, editing?: Transaction | null): void;
  closeTx(): void;
  openQuick(): void;
  closeQuick(): void;
  openEvent(key: string | null, mode?: "view" | "settle"): void;
  openChitSheet(chitId: string | null): void;
  openLife(kind: LifeKind, id?: string, preset?: Partial<LifeItem>): void;
  closeLife(): void;
  openEditor(kind: EditorKind, id?: string, preset?: Record<string, unknown>): void;
  closeEditor(): void;
  setPalette(v: boolean): void;
  setAlerts(v: boolean): void;
  /** Close every sheet, panel and the search palette — used before jumping somewhere new. */
  closeAll(): void;
}

export const useUI = create<UIState>((set) => ({
  txOpen: false,
  txPreset: null,
  txEditing: null,
  quickOpen: false,
  eventKey: null,
  eventMode: "view",
  chitSheet: null,
  life: null,
  editor: null,
  palette: false,
  alerts: false,
  openTx: (preset = null, editing = null) => set({ txOpen: true, txPreset: preset, txEditing: editing, quickOpen: false, palette: false }),
  closeTx: () => set({ txOpen: false, txPreset: null, txEditing: null }),
  openQuick: () => set({ quickOpen: true }),
  closeQuick: () => set({ quickOpen: false }),
  openEvent: (key, mode = "view") => set(key ? { eventKey: key, eventMode: mode, palette: false } : { eventKey: null, eventMode: "view" }),
  openLife: (kind, id, preset) => set({ life: { kind, id, preset }, palette: false, quickOpen: false }),
  closeLife: () => set({ life: null }),
  openChitSheet: (chitId) => set(chitId ? { chitSheet: chitId, palette: false } : { chitSheet: null }),
  openEditor: (kind, id, preset) => set({ editor: { kind, id, preset }, quickOpen: false, palette: false }),
  closeEditor: () => set({ editor: null }),
  setPalette: (v) => set({ palette: v }),
  setAlerts: (v) => set(v ? { alerts: true, palette: false } : { alerts: false }),
  closeAll: () =>
    set({ txOpen: false, txPreset: null, txEditing: null, quickOpen: false, eventKey: null, eventMode: "view", chitSheet: null, life: null, editor: null, palette: false, alerts: false }),
}));
