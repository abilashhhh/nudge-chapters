import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// An effect written as `useEffect(() => something(), deps)` returns something()'s value, and React calls that
// value as the cleanup when the screen changes. If it's not a function (e.g. scrollIntoView, which returns a
// Promise in newer Chrome/Brave), the app crashes with "x is not a function". Effects must use a block body.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("effects", () => {
  it("never return a value by accident (expression-bodied useEffect)", () => {
    const bad = files("src").filter((f) => !f.endsWith("effects.test.ts") && /use(Layout)?Effect\(\(\) => (?!\{)/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
});
