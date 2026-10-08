"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useFinance } from "@/lib/finance";
import { useStore } from "@/lib/store";
import type { RowOf, TableName } from "@/lib/types";
import { Button } from "./ui/button";
import { AmountInput, DateInput, Field, Input, NumberInput, Select, Switch, Textarea } from "./ui/form";
import { ConfirmSheet, Sheet } from "./ui/sheet";

export type FieldType =
  | "text"
  | "money"
  | "number"
  | "int"
  | "percent"
  | "date"
  | "day"
  | "select"
  | "toggle"
  | "textarea"
  | "account"
  | "card"
  | "category"
  | "accounts"
  | "investments"
  | "goal"
  | "loan";

export interface FieldDef<T = Record<string, unknown>> {
  name: keyof T & string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  help?: ReactNode;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  showIf?: (v: Partial<T>) => boolean;
  half?: boolean;
  min?: number;
  max?: number;
  categoryKind?: "income" | "expense" | ((v: Partial<T>) => "income" | "expense");
  noneLabel?: string;
  allowNegative?: boolean;
  section?: string;
  autoFocus?: boolean;
}

type Values = Record<string, unknown>;

function FieldControl<T>({ f, values, set, error }: { f: FieldDef<T>; values: Values; set: (k: string, v: unknown) => void; error?: string }) {
  const { ds, ctx } = useFinance();
  const id = `f-${f.name}`;
  const v = values[f.name];
  const label = f.label;

  if (f.type === "toggle") {
    return <Switch id={id} checked={!!v} onChange={(x) => set(f.name, x)} label={label} help={f.help} />;
  }

  let control: ReactNode;
  switch (f.type) {
    case "text":
      control = <Input id={id} value={(v as string) ?? ""} placeholder={f.placeholder} autoFocus={f.autoFocus} onChange={(e) => set(f.name, e.target.value)} />;
      break;
    case "textarea":
      control = <Textarea id={id} value={(v as string) ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />;
      break;
    case "money":
      control = (
        <AmountInput
          id={id}
          value={(v as number) ?? null}
          currency={ctx.currency}
          locale={ctx.locale}
          allowNegative={f.allowNegative}
          autoFocus={f.autoFocus}
          onChange={(x) => set(f.name, x)}
        />
      );
      break;
    case "number":
    case "int":
    case "percent":
      control = (
        <div className="relative">
          <NumberInput
            id={id}
            value={v == null || Number.isNaN(v as number) ? "" : String(v)}
            min={f.min}
            max={f.max}
            step={f.type === "int" ? 1 : "any"}
            placeholder={f.placeholder}
            onChange={(e) => set(f.name, e.target.value === "" ? null : Number(e.target.value))}
            className={f.type === "percent" ? "pr-8" : undefined}
          />
          {f.type === "percent" && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3">%</span>}
        </div>
      );
      break;
    case "day":
      control = (
        <Select id={id} value={v == null ? "" : String(v)} onChange={(e) => set(f.name, e.target.value === "" ? null : Number(e.target.value))}>
          {f.noneLabel && <option value="">{f.noneLabel}</option>}
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
              {d === 31 ? " (or last day)" : d >= 29 ? " (or last day)" : ""}
            </option>
          ))}
        </Select>
      );
      break;
    case "date":
      control = <DateInput id={id} value={(v as string) ?? ""} onChange={(e) => set(f.name, e.target.value || null)} />;
      break;
    case "select":
      control = (
        <Select
          id={id}
          value={v == null ? "" : String(v)}
          onChange={(e) => {
            const x = e.target.value;
            set(f.name, x === "true" ? true : x === "false" ? false : /^\d+$/.test(x) && typeof v === "number" ? Number(x) : x || null);
          }}
        >
          {f.noneLabel && <option value="">{f.noneLabel}</option>}
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
      break;
    case "account":
      control = (
        <Select id={id} value={(v as string) ?? ""} onChange={(e) => set(f.name, e.target.value || null)}>
          <option value="">{f.noneLabel ?? "Choose an account"}</option>
          {ds.accounts
            .filter((a) => !a.archived || a.id === v)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </Select>
      );
      break;
    case "card":
      control = (
        <Select id={id} value={(v as string) ?? ""} onChange={(e) => set(f.name, e.target.value || null)}>
          <option value="">{f.noneLabel ?? "Choose a card"}</option>
          {ds.credit_cards
            .filter((c) => !c.archived || c.id === v)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.last4 ? ` ··${c.last4}` : ""}
              </option>
            ))}
        </Select>
      );
      break;
    case "goal":
      control = (
        <Select id={id} value={(v as string) ?? ""} onChange={(e) => set(f.name, e.target.value || null)}>
          <option value="">{f.noneLabel ?? "No goal"}</option>
          {ds.goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      );
      break;
    case "loan":
      control = (
        <Select id={id} value={(v as string) ?? ""} onChange={(e) => set(f.name, e.target.value || null)}>
          <option value="">{f.noneLabel ?? "Choose a loan"}</option>
          {ds.loans.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      );
      break;
    case "category": {
      const kind = typeof f.categoryKind === "function" ? f.categoryKind(values as Partial<T>) : f.categoryKind ?? "expense";
      const cats = ds.categories.filter((c) => c.kind === kind && !c.archived);
      const listId = `${id}-list`;
      control = (
        <>
          <Input id={id} list={listId} value={(v as string) ?? ""} placeholder="Pick or type a category" onChange={(e) => set(f.name, e.target.value || null)} />
          <datalist id={listId}>
            {cats.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </>
      );
      break;
    }
    case "accounts":
    case "investments": {
      const list = f.type === "accounts" ? ds.accounts.map((a) => ({ id: a.id, name: a.name })) : ds.investments.filter((i) => !i.archived).map((i) => ({ id: i.id, name: i.name }));
      const selected = new Set((v as string[]) ?? []);
      control = list.length ? (
        <div className="flex flex-wrap gap-2">
          {list.map((o) => {
            const on = selected.has(o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = new Set(selected);
                  if (on) next.delete(o.id);
                  else next.add(o.id);
                  set(f.name, [...next]);
                }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                  on ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                )}
              >
                {on ? "✓ " : ""}
                {o.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">Nothing to link yet.</p>
      );
      break;
    }
  }
  return (
    <Field label={label} help={f.help} error={error} htmlFor={id} optional={f.optional}>
      {control}
    </Field>
  );
}

export function EntityForm<T>({
  fields,
  values,
  onChange,
  errors,
}: {
  fields: FieldDef<T>[];
  values: Values;
  onChange: (v: Values) => void;
  errors: Record<string, string>;
}) {
  const visible = fields.filter((f) => !f.showIf || f.showIf(values as Partial<T>));
  const set = (k: string, v: unknown) => onChange({ ...values, [k]: v });
  const out: ReactNode[] = [];
  let lastSection: string | undefined;
  visible.forEach((f) => {
    if (f.section && f.section !== lastSection) {
      out.push(
        <h3 key={`s-${f.section}`} className="col-span-full mt-3 border-t border-line pt-4 text-[13px] font-semibold text-ink-2 first:mt-0 first:border-0 first:pt-0">
          {f.section}
        </h3>,
      );
      lastSection = f.section;
    }
    out.push(
      <div key={`${f.name}:${f.label}`} className={cn(f.half ? "col-span-2 sm:col-span-1" : "col-span-2")}>
        <FieldControl f={f} values={values} set={set} error={errors[f.name]} />
      </div>,
    );
  });
  return <div className="grid grid-cols-2 gap-x-4 gap-y-4">{out}</div>;
}

export function validateFields<T>(fields: FieldDef<T>[], values: Values): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const f of fields) {
    if (f.showIf && !f.showIf(values as Partial<T>)) continue;
    const v = values[f.name];
    if (f.required && (v == null || v === "" || (typeof v === "number" && Number.isNaN(v)))) {
      errs[f.name] = `Enter ${f.label.toLowerCase()}`;
      continue;
    }
    if (typeof v === "number") {
      if (f.min != null && v < f.min) errs[f.name] = `Must be at least ${f.min}`;
      if (f.max != null && v > f.max) errs[f.name] = `Must be at most ${f.max}`;
      if ((f.type === "money" && !f.allowNegative) && v < 0) errs[f.name] = "Must be zero or more";
    }
  }
  return errs;
}

/** Add / edit sheet for any table, driven by field definitions. */
export function EntityEditor<T extends TableName>({
  open,
  onClose,
  table,
  initial,
  fields,
  title,
  description,
  validate,
  transform,
  onSaved,
  deleteLabel,
  deleteBody,
  extra,
  saveLabel,
}: {
  open: boolean;
  onClose: () => void;
  table: T;
  initial: Partial<RowOf<T>>;
  fields: FieldDef<RowOf<T>>[];
  title: string;
  description?: ReactNode;
  validate?: (v: Partial<RowOf<T>>) => Record<string, string>;
  transform?: (v: Partial<RowOf<T>>) => Partial<RowOf<T>>;
  onSaved?: (row: RowOf<T>, isNew: boolean) => void | Promise<void>;
  deleteLabel?: string;
  deleteBody?: ReactNode;
  extra?: (values: Values, set: (v: Values) => void) => ReactNode;
  saveLabel?: string;
}) {
  const add = useStore((s) => s.add);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const [values, setValues] = useState<Values>(initial as Values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const id = (initial as { id?: string }).id;
  const initialKey = useMemo(() => JSON.stringify(initial), [initial]);

  useEffect(() => {
    if (open) {
      setValues(initial as Values);
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialKey]);

  const save = async () => {
    const errs = { ...validateFields(fields, values), ...(validate?.(values as Partial<RowOf<T>>) ?? {}) };
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      let body = values as Partial<RowOf<T>>;
      if (transform) body = transform(body);
      for (const k of Object.keys(body) as (keyof typeof body)[]) if (body[k] === "") (body as Record<string, unknown>)[k as string] = null;
      if (id) {
        const { id: _i, created_at: _c, updated_at: _u, user_id: _uid, ...rest } = body as Record<string, unknown>;
        await patch(table, id, rest as Partial<RowOf<T>>);
        await onSaved?.({ ...(initial as object), ...rest } as unknown as RowOf<T>, false);
      } else {
        const row = await add(table, body);
        await onSaved?.(row, true);
      }
      onClose();
    } catch {
      /* toast already shown by the store */
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={title}
        description={description}
        footer={
          <div className="flex items-center gap-2">
            {id && deleteLabel && (
              <Button variant="ghost" className="text-danger hover:text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(true)}>
                <span className="hidden xs:inline">{deleteLabel}</span>
              </Button>
            )}
            <div className="flex-1" />
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={save}>
              {saveLabel ?? (id ? "Save changes" : "Add")}
            </Button>
          </div>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <EntityForm fields={fields} values={values} onChange={setValues} errors={errors} />
          {extra?.(values, setValues)}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </Sheet>
      {id && deleteLabel && (
        <ConfirmSheet
          open={confirm}
          onClose={() => setConfirm(false)}
          title={deleteLabel}
          body={deleteBody ?? "This can't be undone."}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await remove(table, id);
            onClose();
          }}
        />
      )}
    </>
  );
}
