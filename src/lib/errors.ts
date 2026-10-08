// Turns low-level failures (network, timeout, auth, database) into messages a person can act on.

function rawMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "";
}

export function friendlyError(e: unknown): string {
  const raw = rawMessage(e).trim();
  const m = raw.toLowerCase();
  const name = e instanceof Error || (typeof DOMException !== "undefined" && e instanceof DOMException) ? (e as Error).name : "";
  if (!raw) return "Something went wrong. Please try again.";
  if (name === "TimeoutError" || name === "AbortError" || m.includes("timed out") || m.includes("timeout"))
    return "The server took too long to respond. Please try again.";
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed") || m.includes("network request failed"))
    return typeof navigator !== "undefined" && navigator.onLine === false
      ? "You're offline. Reconnect and try again."
      : "Can't reach the server right now. Check your connection and try again.";
  if (m.includes("jwt") || m.includes("not authenticated") || m.includes("refresh token") || m.includes("auth session missing"))
    return "Your session has expired. Sign in again to continue.";
  if (m.includes("row-level security") || m.includes("permission denied")) return "You don't have permission to change this record.";
  if (m.includes("duplicate key")) return "This record already exists.";
  if (m.includes("violates foreign key")) return "This record is linked to something that no longer exists. Refresh and try again.";
  if (/\b5\d\d\b|internal server error|bad gateway|service unavailable|gateway timeout/.test(m)) return "The server had a problem. Please try again in a moment.";
  return raw;
}
