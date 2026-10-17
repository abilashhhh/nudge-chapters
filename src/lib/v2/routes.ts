// Version 2 navigation and the map from Version 1 screens to their Version 2 homes.
// Used for redirects (bookmarks, alarms, links inside shared sheets) and by the search palette.

export interface V2NavItem {
  href: string;
  label: string;
  /** One line shown under the page title. */
  meaning: string;
  /** Left off the phone's bottom bar (it has room for six); reached from Menu there instead. */
  desktopOnly?: boolean;
}

export const V2_NAV: V2NavItem[] = [
  { href: "/", label: "Home", meaning: "Your money at a glance" },
  { href: "/my-money", label: "My Money", meaning: "Money in your bank and money others owe you" },
  { href: "/to-pay", label: "To Pay", meaning: "Bills, EMIs and installments you have to pay" },
  { href: "/savings", label: "Savings", meaning: "What your savings and investments are worth" },
  { href: "/daily", label: "Daily", meaning: "Your daily rhythm, to-do, reminders, notes and wishlist" },
  { href: "/trading-training", label: "Trading Training", meaning: "Learn to read candlestick charts: lessons, quizzes and daily practice", desktopOnly: true },
  { href: "/menu", label: "Menu", meaning: "Planning tools and settings" },
];

/** The Daily section's parts (tabs of /daily), also listed under "Daily" in the desktop sidebar. */
export const V2_DAILY: { tab: string; label: string }[] = [
  { tab: "rhythm", label: "Daily Rhythm" },
  { tab: "todo", label: "To-do & checklists" },
  { tab: "reminders", label: "Reminders" },
  { tab: "notes", label: "Notes" },
  { tab: "wishlist", label: "Wishlist" },
];

/** Tab names per screen, for breadcrumbs. */
export const V2_TABS: Record<string, Record<string, string>> = {
  "/my-money": { accounts: "Bank accounts", owed: "People owe me" },
  "/to-pay": { cards: "Credit cards", chits: "Chits & SIPs", loans: "Loans & borrowed" },
  "/savings": { funds: "Mutual funds", stocks: "Stocks", epf: "EPF & PF", chits: "Chits", commodities: "Commodities", other: "Other savings" },
  "/daily": Object.fromEntries(V2_DAILY.map((d) => [d.tab, d.label])),
  "/menu/settings": {
    profile: "Profile",
    categories: "Categories",
    notifications: "Alerts",
    data: "Import & export",
    security: "Security",
    appearance: "Look",
  },
};

/** The first tab each screen opens on (so its breadcrumb reads complete). */
export const V2_DEFAULT_TAB: Record<string, string> = { "/my-money": "accounts", "/to-pay": "cards", "/savings": "funds", "/daily": "rhythm", "/menu/settings": "profile" };

/** Menu sub-pages (Version 2). */
export const V2_MENU_PAGES: Record<string, string> = {
  "/menu/income": "My jobs & income",
  "/menu/budgets": "Budgets & spending plans",
  "/menu/insurance": "Insurance",
  "/menu/goals": "Goals",
  "/menu/calendar": "Calendar",
  "/menu/sms": "Bank SMS",
  "/menu/contacts": "Contacts",
  "/menu/sinking": "Sinking funds",
  "/menu/tax": "Tax estimate",
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
      if (tab === "retirement") return "/savings?tab=epf";
      if (tab === "property") return "/savings?tab=other";
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
    case "/insurance":
      return "/menu/insurance";
    case "/plan":
      if (tab === "notes" || tab === "reminders" || tab === "wishlist") return `/daily?tab=${tab}`;
      return "/daily?tab=todo";
    case "/goals":
      return "/menu/goals";
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
    // Daily used to live under Menu.
    case "/menu/notes":
      return "/daily?tab=notes";
    case "/menu/reminders":
      return "/daily?tab=reminders";
    case "/menu/todo":
      return "/daily?tab=todo";
    case "/menu/wishlist":
      return "/daily?tab=wishlist";
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

export interface Crumb {
  label: string;
  href: string;
}

/** Breadcrumb trail for a Version 2 screen: Home › Section › (Menu page) › Tab. */
export function v2Crumbs(pathname: string, search: string | URLSearchParams = ""): Crumb[] {
  const path = strip(pathname);
  const q = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search) : search;
  if (path === "/") return [];
  const out: Crumb[] = [{ label: "Home", href: "/" }];
  const top = V2_NAV.find((n) => n.href !== "/" && isActiveV2(path, n.href));
  if (top) out.push({ label: top.label, href: top.href });
  if (V2_MENU_PAGES[path]) out.push({ label: V2_MENU_PAGES[path], href: path });
  const tabs = V2_TABS[path];
  if (tabs) {
    const tab = q.get("tab") && tabs[q.get("tab")!] ? q.get("tab")! : V2_DEFAULT_TAB[path];
    if (tab && tabs[tab]) out.push({ label: tabs[tab], href: `${path}?tab=${tab}` });
  }
  return out;
}
