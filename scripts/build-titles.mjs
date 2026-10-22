/**
 * Build a compact title index from andshrew/PlayStation-Titles.
 * Source: https://github.com/andshrew/PlayStation-Titles (MIT)
 * Regions come from the content-ID territory prefix in that dataset.
 * Nothing here invents title IDs.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = resolve(root, "data/cache");
const tsvPath = resolve(cacheDir, "All_Titles.tsv");
const outPath = resolve(root, "public/titles.json");
const sourceUrl =
  "https://raw.githubusercontent.com/andshrew/PlayStation-Titles/main/All_Titles.tsv";
const repoUrl = "https://github.com/andshrew/PlayStation-Titles";

const REGION_LETTER = {
  E: "EU",
  U: "US",
  J: "JP",
  H: "Asia",
  K: "KR",
  I: "INT",
};

const TAGS = ["EU", "UK", "US", "JP", "AS", "AU", "NA", "KO", "HK", "TW", "CN", "SA", "AE", "MX", "BR", "KR"];
const TAG_RE = new RegExp(`[0-9](${TAGS.join("|")})$`);

const REGION_ORDER = { EU: 0, US: 1, JP: 2, Asia: 3, KR: 4, INT: 5, "?": 6 };

mkdirSync(cacheDir, { recursive: true });
mkdirSync(resolve(root, "public"), { recursive: true });

function download() {
  execFileSync(
    "curl",
    ["-fsSL", "--retry", "4", "--retry-delay", "2", "-o", tsvPath, sourceUrl],
    { stdio: "inherit" },
  );
}

let commit = "";
try {
  const meta = execFileSync(
    "curl",
    ["-fsSL", "--retry", "3", "https://api.github.com/repos/andshrew/PlayStation-Titles/commits/main"],
    { encoding: "utf8" },
  );
  commit = JSON.parse(meta).sha || "";
} catch {
  commit = "";
}

if (process.argv.includes("--offline")) {
  if (!existsSync(tsvPath)) {
    console.error("No cached TSV and --offline was set.");
    process.exit(1);
  }
} else {
  try {
    download();
  } catch (error) {
    if (!existsSync(tsvPath)) throw error;
    console.warn("Download failed, using cached TSV.");
  }
}

function cleanName(name) {
  return name
    .replace(/[™®©]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function productKey(contentId) {
  if (!contentId) return "";
  const parts = contentId.split("-");
  if (parts.length < 3) return "";
  let label = parts.slice(2).join("-").toUpperCase();
  label = label.replace(TAG_RE, (match) => match.slice(0, -2));
  label = label.replace(/^0+|0+$/g, "");
  return label;
}

function regionTag(contentId) {
  if (!contentId) return "";
  const parts = contentId.split("-");
  const label = (parts[2] || "").toUpperCase();
  const match = label.match(TAG_RE);
  return match ? match[1] : "";
}

function mapRegion(regionField, contentId) {
  let code = (regionField || "").toUpperCase();
  if (!code && contentId) code = contentId.split("-")[0].slice(0, 2).toUpperCase();
  const letter = code[0] || "";
  return REGION_LETTER[letter] || "?";
}

function titleIdOf(raw) {
  const match = raw.toUpperCase().match(/^(CUSA|PPSA)(\d{4,6})(?:_(\d{2}))?$/);
  if (!match) return null;
  const suffix = match[3] && match[3] !== "00" ? `_${match[3]}` : "";
  return {
    id: `${match[1]}${match[2]}${suffix}`,
    platform: match[1] === "CUSA" ? "4" : "5",
  };
}

function usefulTag(region, tag) {
  if (!tag) return "";
  if (region === "EU" && (tag === "EU" || tag === "UK" || tag === "AU")) {
    return tag === "EU" ? "" : tag;
  }
  if (region === "US" && (tag === "US" || tag === "NA")) return "";
  if (region === "JP" && tag === "JP") return "";
  if (region === "Asia" && (tag === "AS" || tag === "HK")) return tag === "AS" ? "" : tag;
  if (region === "KR" && (tag === "KR" || tag === "KO")) return "";
  if (region === "EU" || region === "US" || region === "JP" || region === "Asia" || region === "KR") {
    return tag;
  }
  return tag;
}

const text = readFileSync(tsvPath, "utf8");
const lines = text.split(/\n/);
const header = lines[0].split("\t");
if (header[0] !== "titleId" || header[2] !== "name" || header[4] !== "region") {
  console.error("Unexpected TSV header:", header.join("|"));
  process.exit(1);
}

/** @type {Map<string, {concept: string, names: Map<string, number>, productKeys: Set<string>, skus: Map<string, {id: string, region: string, platform: string, tag: string, name: string}>}>} */
const groups = new Map();

let rows = 0;
let skipped = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;
  const parts = line.split("\t");
  if (parts.length < 6) {
    skipped++;
    continue;
  }
  const [rawId, concept, rawName, contentId, regionField] = parts;
  const parsed = titleIdOf(rawId.trim());
  if (!parsed) {
    skipped++;
    continue;
  }
  const name = cleanName(rawName);
  if (!name || /entitlement/i.test(name)) {
    skipped++;
    continue;
  }
  rows++;
  const key = `${concept}\n${name.toLowerCase()}`;
  let group = groups.get(key);
  if (!group) {
    group = {
      concept,
      names: new Map(),
      productKeys: new Set(),
      skus: new Map(),
    };
    groups.set(key, group);
  }
  group.names.set(name, (group.names.get(name) || 0) + 1);
  const pk = productKey(contentId);
  if (pk) group.productKeys.add(`${concept}\n${pk}`);
  const region = mapRegion(regionField, contentId);
  const tag = usefulTag(region, regionTag(contentId));
  const prev = group.skus.get(parsed.id);
  if (!prev || (prev.region === "?" && region !== "?")) {
    group.skus.set(parsed.id, {
      id: parsed.id,
      region,
      platform: parsed.platform,
      tag,
      name,
    });
  }
}

// Fold non-Latin names into the single Latin group that shares a product key.
const byProduct = new Map();
for (const group of groups.values()) {
  for (const pk of group.productKeys) {
    let list = byProduct.get(pk);
    if (!list) byProduct.set(pk, (list = []));
    list.push(group);
  }
}

function isLatin(group) {
  for (const name of group.names.keys()) {
    if (/[A-Za-z]/.test(name)) return true;
  }
  return false;
}

function chooseName(group) {
  const entries = [...group.names.entries()];
  const latin = entries.filter(([name]) => /[A-Za-z]/.test(name));
  const pool = latin.length ? latin : entries;
  pool.sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]));
  return pool[0][0];
}

const dropped = new Set();
for (const list of byProduct.values()) {
  const unique = [...new Set(list)].filter((group) => !dropped.has(group));
  const latin = unique.filter(isLatin);
  const other = unique.filter((group) => !isLatin(group));
  if (latin.length !== 1 || other.length === 0) continue;
  const target = latin[0];
  for (const group of other) {
    for (const [name, count] of group.names) {
      target.names.set(name, (target.names.get(name) || 0) + count);
    }
    for (const [id, sku] of group.skus) {
      const prev = target.skus.get(id);
      if (!prev || (prev.region === "?" && sku.region !== "?")) target.skus.set(id, sku);
    }
    dropped.add(group);
  }
}

const seenIds = new Map();
const games = [];
for (const group of groups.values()) {
  if (dropped.has(group)) continue;
  const name = chooseName(group);
  const aliases = [...group.names.keys()].filter((item) => item !== name).slice(0, 6);
  const skus = [];
  for (const sku of group.skus.values()) {
    const prev = seenIds.get(sku.id);
    if (prev) {
      if (prev.region === "?" && sku.region !== "?") {
        prev.region = sku.region;
        prev.tag = sku.tag;
        prev.platform = sku.platform;
      }
      continue;
    }
    const stored = {
      id: sku.id,
      region: sku.region,
      platform: sku.platform,
      tag: sku.tag,
    };
    seenIds.set(sku.id, stored);
    skus.push(stored);
  }
  if (!skus.length) continue;
  skus.sort((a, b) => {
    if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
    const regionDelta = (REGION_ORDER[a.region] ?? 9) - (REGION_ORDER[b.region] ?? 9);
    if (regionDelta) return regionDelta;
    if (a.tag !== b.tag) return a.tag < b.tag ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  games.push({ name, aliases, skus });
}

games.sort((a, b) => a.name.localeCompare(b.name) || a.skus[0].id.localeCompare(b.skus[0].id));

function findSku(id) {
  for (const game of games) {
    for (const sku of game.skus) {
      if (sku.id === id) return { game, sku };
    }
  }
  return null;
}

const expectations = [
  ["CUSA07408", "US", "God of War", ""],
  ["CUSA07410", "EU", "God of War", ""],
  ["CUSA07411", "EU", "God of War", ""],
  ["CUSA07412", "EU", "God of War", ""],
  ["CUSA07435", "JP", "God of War", ""],
  ["CUSA07413", "Asia", "God of War", ""],
  ["CUSA07820", "US", "The Last of Us Part II", ""],
  ["CUSA10249", "EU", "The Last of Us Part II", ""],
  ["CUSA13986", "JP", "The Last of Us Part II", ""],
  ["CUSA14006", "Asia", "The Last of Us Part II", ""],
  ["CUSA00900", "US", "Bloodborne", ""],
  ["CUSA00207", "EU", "Bloodborne", ""],
  ["CUSA00208", "EU", "Bloodborne", "UK"],
  ["CUSA00299", "JP", "Bloodborne", ""],
  ["CUSA01363", "Asia", "Bloodborne", ""],
  ["CUSA03173", "EU", "Bloodborne", ""],
  ["PPSA01317", "US", "Gran Turismo 7", ""],
  ["PPSA01316", "EU", "Gran Turismo 7", ""],
  ["PPSA01318", "Asia", "Gran Turismo 7", ""],
  ["CUSA02299", "US", "Marvel's Spider-Man", ""],
  ["CUSA11993", "EU", "Marvel's Spider-Man", ""],
  ["CUSA09751", "JP", "Marvel's Spider-Man", ""],
  ["CUSA09893", "Asia", "Marvel's Spider-Man", ""],
];

let failed = 0;
for (const [id, region, name, tag] of expectations) {
  const found = findSku(id);
  if (!found) {
    console.error("MISSING", id, name);
    failed++;
    continue;
  }
  if (found.sku.region !== region || found.game.name !== name || (found.sku.tag || "") !== tag) {
    console.error(
      "MISMATCH",
      id,
      "got",
      found.game.name,
      found.sku.region,
      found.sku.tag,
      "expected",
      name,
      region,
      tag,
    );
    failed++;
  }
}

const art = findSku("CUSA09943");
const gow = findSku("CUSA07408");
if (!art || art.game === gow?.game) {
  console.error("Art book CUSA09943 should not share the God of War game card");
  failed++;
}

if (games.length < 8000 || seenIds.size < 30000) {
  console.error("Index looks too small", games.length, seenIds.size);
  failed++;
}

if (failed) process.exit(1);

const compactGames = games.map((game) => {
  const skus = game.skus.map((sku) => {
    if (sku.tag) return [sku.id, sku.region, sku.platform, sku.tag];
    return [sku.id, sku.region, sku.platform];
  });
  return [game.name, game.aliases.length ? game.aliases : null, skus];
});

const payload = {
  source: repoUrl,
  commit,
  license: "MIT",
  generated: new Date().toISOString().slice(0, 10),
  games: games.length,
  ids: seenIds.size,
  titles: compactGames,
};

writeFileSync(outPath, JSON.stringify(payload));
const bytes = Buffer.byteLength(JSON.stringify(payload));
console.log(
  `Wrote ${outPath} games=${games.length} ids=${seenIds.size} rows=${rows} skipped=${skipped} bytes=${bytes} commit=${commit.slice(0, 12)}`,
);
