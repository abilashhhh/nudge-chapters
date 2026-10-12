// Keeps the last few builds' JavaScript/CSS online after a deploy.
//
// Every deploy replaces the whole site. A tab opened before a deploy (or a page the browser cached for up to
// 10 minutes) still asks for the previous build's files; if they're gone, the page crashes with
// "This page couldn't load". So before publishing, this copies the previous builds' files from the live site
// (the gh-pages checkout) into the new output. Hashed file names never clash, and only the last KEEP builds
// are carried, so the site doesn't grow forever. A list of which build owns which file is published as
// _next/static/.builds.json.
//
// Usage: node scripts/keep-recent-assets.mjs <previous-site-dir> <out-dir> <build-id>
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const KEEP = 5; // this build + the 4 before it
const [prev, out, id] = process.argv.slice(2);
if (!out || !id) {
  console.error("usage: keep-recent-assets.mjs <previous-site-dir> <out-dir> <build-id>");
  process.exit(1);
}

const STATIC = "_next/static";
const MANIFEST = join(STATIC, ".builds.json");

function files(root, sub = STATIC) {
  const dir = join(root, sub);
  if (!existsSync(dir)) return [];
  const list = [];
  for (const name of readdirSync(dir)) {
    if (name === ".builds.json") continue;
    const rel = join(sub, name);
    if (statSync(join(root, rel)).isDirectory()) list.push(...files(root, rel));
    else list.push(rel);
  }
  return list;
}

const mine = { id, files: files(out) };
let older = [];
if (prev && existsSync(prev)) {
  const m = join(prev, MANIFEST);
  if (existsSync(m)) {
    try {
      older = JSON.parse(readFileSync(m, "utf8")).builds ?? [];
    } catch {
      older = [];
    }
  } else {
    // The live site predates this script: treat everything it has as one previous build.
    older = [{ id: "previous", files: files(prev) }];
  }
}
const kept = older.filter((b) => b.id !== id).slice(0, KEEP - 1);

let copied = 0;
for (const b of kept) {
  for (const f of b.files) {
    const src = join(prev, f);
    const dst = join(out, f);
    if (!existsSync(dst) && existsSync(src)) {
      cpSync(src, dst);
      copied++;
    }
  }
}
writeFileSync(join(out, MANIFEST), JSON.stringify({ builds: [mine, ...kept] }));
console.log(`Kept ${copied} files from ${kept.length} earlier build(s): ${kept.map((b) => b.id).join(", ") || "none"}`);
console.log(`This build ${id}: ${mine.files.length} files. ${relative(process.cwd(), join(out, MANIFEST))} written.`);
