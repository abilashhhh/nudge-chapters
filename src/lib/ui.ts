"use client";

import { create } from "zustand";
import type { Transaction } from "./types";

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
  editor: EditorState | null;
  palette: boolean;
  alerts: boolean;
  openTx(preset?: Partial<Transaction> | null, editing?: Transaction | null): void;
  closeTx(): void;
  openQuick(): void;
  closeQuick(): void;
  openEvent(key: string | null): void;
  openEditor(kind: EditorKind, id?: string, preset?: Record<string, unknown>): void;
  closeEditor(): void;
  setPalette(v: boolean): void;
  setAlerts(v: boolean): void;
}

export const useUI = create<UIState>((set) => ({
  txOpen: false,
  txPreset: null,
  txEditing: null,
  quickOpen: false,
  eventKey: null,
  editor: null,
  palette: false,
  alerts: false,
  openTx: (preset = null, editing = null) => set({ txOpen: true, txPreset: preset, txEditing: editing, quickOpen: false }),
  closeTx: () => set({ txOpen: false, txPreset: null, txEditing: null }),
  openQuick: () => set({ quickOpen: true }),
  closeQuick: () => set({ quickOpen: false }),
  openEvent: (key) => set({ eventKey: key }),
  openEditor: (kind, id, preset) => set({ editor: { kind, id, preset }, quickOpen: false, palette: false }),
  closeEditor: () => set({ editor: null }),
  setPalette: (v) => set({ palette: v }),
  setAlerts: (v) => set({ alerts: v }),
}));
