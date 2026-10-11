// Version 2 navigation and the map from Version 1 screens to their Version 2 homes.
// Used for redirects (bookmarks, alarms, links inside shared sheets) and by the search palette.

export interface V2NavItem {
  href: string;
  label: string;
  /** One line shown under the page title. */
  meaning: string;
}

export const V2_NAV: V2NavItem[] = [
  { href: "/", label: "Home", meaning: "Your money at a glance" },
  { href: "/my-money", label: "My Money", meaning: "Money in your bank and money others owe you" },
  { href: "/to-pay", label: "To Pay", meaning: "Bills, EMIs and installments you have to pay" },
  { href: "/savings", label: "Savings", meaning: "What your savings and investments are worth" },
  { href: "/menu", label: "Menu", meaning: "Planning tools and settings" },
];

/** Menu sub-pages (Version 2). */
export const V2_MENU_PAGES: Record<string, string> = {
  "/menu/notes": "Notes",
  "/menu/reminders": "Reminders",
  "/menu/todo": "To-do & checklists",
  "/menu/wishlist": "Wishlist",
  "/menu/income": "My jobs & income",
  "/menu/budgets": "Budgets & spending plans",
  "/menu/calendar": "Calendar",
  "/menu/future": "Future",
  "/menu/settings": "Settings",
  "/menu/help": "Help & support",
};

function strip(p: string): string {
  const s = p.replace(/\/+$/, "");
  return s === "" ? "/" : s;
}

/**
 * Where a Version 1 URL lives in Version 2. Returns null when the path is already a Version 2 screen
 * (or isn't an app screen at all). Keeps the useful query parameters (loan id, projection date, settings tab).
 */
export function toV2Href(pathname: string, search: string | URLSearchParams = ""): string | null {
  const path = strip(pathname);
  const q = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search) : search;
  const tab = q.get("tab");
  const keep = (base: string, keys: string[]) => {
    const out = new URLSearchParams();
    for (const k of keys) {
      const v = q.get(k);
      if (v) out.set(k, v);
    }
    const s = out.toString();
    return s ? `${base}${base.includes("?") ? "&" : "?"}${s}` : base;
  };
  switch (path) {
    case "/money":
      return keep("/", ["add"]);
    case "/owed":
      return "/my-money?tab=owed";
    case "/assets":
      if (tab === "lending") return "/my-money?tab=owed";
      if (tab === "investments") return "/savings?tab=funds";
      if (tab === "retirement" || tab === "property") return "/savings?tab=other";
      return "/my-money?tab=accounts";
    case "/liabilities":
      if (tab === "chits") return "/to-pay?tab=chits";
      if (tab === "loans" || tab === "borrowed" || tab === "planner") return keep("/to-pay?tab=loans", ["loan"]);
      return "/to-pay?tab=cards";
    case "/cash-flow":
      if (tab === "bills") return "/to-pay";
      if (tab === "transactions") return "/my-money?tab=accounts";
      if (tab === "recurring" || tab === "reserves" || tab === "subscriptions") return "/menu/budgets";
      return "/";
    case "/budgets":
      return "/menu/budgets";
    case "/plan":
      if (tab === "notes") return "/menu/notes";
      if (tab === "reminders") return "/menu/reminders";
      if (tab === "wishlist") return "/menu/wishlist";
      return "/menu/todo";
    case "/goals":
      return "/menu/future#goals";
    case "/projection":
      if (tab === "afford") return keep("/menu/future", ["amount", "date"]) + "#afford";
      return keep("/menu/future", ["date"]);
    case "/calendar":
      return "/menu/calendar";
    case "/reports":
      return "/";
    case "/settings":
      return keep("/menu/settings", ["tab"]);
    case "/more":
      return "/menu";
    case "/support":
      return "/menu/help";
    default:
      return null;
  }
}

/** Same map for a full href like "/liabilities?tab=loans&loan=1". */
export function hrefForV2(href: string): string {
  const [pathAndQuery, hash] = href.split("#");
  const [path, query = ""] = pathAndQuery.split("?");
  const mapped = toV2Href(path, query);
  if (!mapped) return href;
  return hash && !mapped.includes("#") ? `${mapped}#${hash}` : mapped;
}

export function isActiveV2(pathname: string, href: string): boolean {
  const p = strip(pathname);
  if (href === "/") return p === "/";
  return p === href || p.startsWith(href + "/");
}

export function v2Title(pathname: string): string | null {
  const p = strip(pathname);
  if (V2_MENU_PAGES[p]) return V2_MENU_PAGES[p];
  return V2_NAV.find((n) => isActiveV2(p, n.href))?.label ?? null;
}
