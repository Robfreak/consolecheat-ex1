export type Region = "EU" | "US" | "JP" | "Asia" | "KR" | "INT" | "?";
export type Platform = "PS4" | "PS5";

export type Sku = {
  id: string;
  region: Region;
  platform: Platform;
  tag?: string;
};

export type Game = {
  name: string;
  aliases: string[];
  skus: Sku[];
};

export type TitlesFile = {
  format: number;
  source: string;
  commit: string;
  license: string;
  generated: string;
  games: number;
  ids: number;
  names: string;
  aliases?: Record<string, string[]>;
  skus: string;
};

const REGION_FROM: Record<string, Region> = {
  E: "EU",
  U: "US",
  J: "JP",
  H: "Asia",
  K: "KR",
  I: "INT",
  "?": "?",
};

const REGION_SORT: Record<Region, number> = {
  EU: 0,
  US: 1,
  JP: 2,
  Asia: 3,
  KR: 4,
  INT: 5,
  "?": 6,
};

export type SearchHit = {
  game: Game;
  score: number;
  matched: string[];
  viaId: boolean;
};

export type Filters = {
  platform: "all" | Platform;
  region: "all" | Region;
};

const STOP = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "for",
  "to",
  "from",
  "with",
  "in",
  "on",
  "at",
  "by",
  "und",
  "der",
  "die",
  "das",
  "den",
  "dem",
  "ein",
  "eine",
  "le",
  "la",
  "les",
  "des",
  "du",
  "et",
  "el",
  "los",
  "las",
  "da",
  "do",
  "di",
]);

const ROMAN: Record<string, string> = {
  ii: "2",
  iii: "3",
  iv: "4",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  xi: "11",
  xii: "12",
};

// Longer numerals first so "viii" does not become "8ii". i, v, and x stay words (GTA V, FF X).
const ROMAN_WORD = /\b(?:xii|xi|viii|vii|vi|ix|iv|iii|ii)\b/g;

function foldRoman(norm: string): string {
  return norm.replace(ROMAN_WORD, (roman) => ROMAN[roman]);
}

const ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789";

function decodeNameList(text: string): string[] {
  if (!text) return [];
  const names: string[] = [];
  let prev = "";
  for (const line of text.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const keep = Number(line.slice(0, tab));
    const name = prev.slice(0, keep) + line.slice(tab + 1);
    names.push(name);
    prev = name;
  }
  return names;
}

export function decodeTitles(file: TitlesFile): Game[] {
  const names = decodeNameList(file.names);
  const grouped: Sku[][] = Array.from({ length: names.length }, () => []);
  let prefix = "";
  let num = 0;
  for (const line of file.skus ? file.skus.split("\n") : []) {
    if (!line) continue;
    let i = 0;
    if (line[0] === "C" || line[0] === "P") {
      prefix = line[0];
      num = Number(line.slice(1, 6));
      i = 6;
    } else {
      let j = 0;
      while (j < line.length && line.charCodeAt(j) >= 48 && line.charCodeAt(j) <= 57) j++;
      num += Number(line.slice(0, j));
      i = j;
    }
    const region = REGION_FROM[line[i]] ?? "?";
    const platform: Platform = line[i + 1] === "5" ? "PS5" : "PS4";
    const at = line.indexOf("@", i + 2);
    const tag = at >= 0 ? line.slice(i + 2, at) : "";
    const gi = Number(line.slice(at + 1));
    if (!grouped[gi]) continue;
    grouped[gi].push({
      id: `${prefix === "P" ? "PPSA" : "CUSA"}${String(num).padStart(5, "0")}`,
      region,
      platform,
      tag: tag || undefined,
    });
  }
  return names.map((name, gi) => {
    const skus = grouped[gi] ?? [];
    skus.sort((a, b) => {
      if (a.platform !== b.platform) return a.platform < b.platform ? -1 : 1;
      const regionDelta = (REGION_SORT[a.region] ?? 9) - (REGION_SORT[b.region] ?? 9);
      if (regionDelta) return regionDelta;
      const aTag = a.tag ?? "";
      const bTag = b.tag ?? "";
      if (aTag !== bTag) return aTag < bTag ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return { name, aliases: file.aliases?.[String(gi)] ?? [], skus };
  });
}

export function normalize(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[™®©]/g, "")
    .replace(/[’‘`]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokensOf(normalized: string): string[] {
  const out: string[] = [];
  for (const part of normalized.split(" ")) {
    if (!part) continue;
    const token = ROMAN[part] ?? part;
    if (STOP.has(token)) continue;
    if (token.length === 1 && !/\d/.test(token)) continue;
    out.push(token);
  }
  return out;
}

function gramsOf(flat: string): string[] {
  const grams: string[] = [];
  for (let i = 0; i < flat.length - 2; i++) grams.push(flat.slice(i, i + 3));
  return grams;
}

function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const gram = a.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  let shared = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const gram = b.slice(i, i + 2);
    const have = counts.get(gram) ?? 0;
    if (have > 0) {
      shared++;
      counts.set(gram, have - 1);
    }
  }
  return (2 * shared) / (a.length + b.length - 2);
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === b.length) {
    let first = -1;
    let second = -1;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (first < 0) first = i;
      else if (second < 0) second = i;
      else return levenshtein(a, b);
    }
    if (first < 0) return 0;
    if (second < 0) return 1;
    if (second === first + 1 && a[first] === b[second] && a[second] === b[first]) return 1;
  }
  return levenshtein(a, b);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > 2) return 3;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function fuzzyVariants(token: string): string[] {
  if (!/^[a-z0-9]+$/.test(token) || token.length < 2 || token.length > 18) return [];
  const out = new Set<string>();
  const n = token.length;
  const allowSub = n >= 4 && n <= 12;
  const allowIns = n <= 12;
  const allowDel = n >= 3;
  const allowTrans = n >= 3;
  if (allowDel) {
    for (let i = 0; i < n; i++) out.add(token.slice(0, i) + token.slice(i + 1));
  }
  if (allowTrans) {
    for (let i = 0; i < n - 1; i++) {
      out.add(token.slice(0, i) + token[i + 1] + token[i] + token.slice(i + 2));
    }
  }
  if (allowSub || allowIns) {
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < ALPHA.length; a++) {
        const ch = ALPHA[a];
        if (allowSub && ch !== token[i]) out.add(token.slice(0, i) + ch + token.slice(i + 1));
        if (allowIns) out.add(token.slice(0, i) + ch + token.slice(i));
      }
    }
    if (allowIns) {
      for (let a = 0; a < ALPHA.length; a++) out.add(token + ALPHA[a]);
    }
  }
  out.delete(token);
  const list: string[] = [];
  for (const item of out) {
    if (item.length >= 2) list.push(item);
  }
  return list;
}

const SIDE =
  /\b(?:demo|demos|trial|beta|vr|psvr|dlc|ost|soundtrack|artbook|comic|avatar|theme|themes|upgrade|wallpaper|bonus|bundle|multiplayer)\b|\bart of\b|\bvirtual reality\b|\bmotion comic\b|\boriginal soundtrack\b|\bseason pass\b|\badd on\b/;

const TOKEN_ALIAS: Record<string, string> = {
  cod: "call of duty",
  mw: "modern warfare",
  mw2: "modern warfare 2",
  mwii: "modern warfare 2",
  mw3: "modern warfare 3",
  mwiii: "modern warfare 3",
  bo2: "black ops 2",
  bo3: "black ops 3",
  bo4: "black ops 4",
  bo6: "black ops 6",
  gow: "god of war",
  gowr: "god of war ragnarok",
  tlou: "the last of us",
  tlou1: "the last of us part 1",
  tlou2: "the last of us part 2",
  gta: "grand theft auto",
  rdr: "red dead redemption",
  rdr2: "red dead redemption 2",
  gt7: "gran turismo 7",
  hzd: "horizon zero dawn",
  hfw: "horizon forbidden west",
  nfs: "need for speed",
  ff7: "final fantasy 7",
  ff7r: "final fantasy 7 remake",
  p5: "persona 5",
  p5r: "persona 5 royal",
  mhw: "monster hunter world",
  nms: "no mans sky",
  uc4: "uncharted 4",
  sm2: "spider man 2",
  cp2077: "cyberpunk 2077",
  tw3: "the witcher 3",
  mgs5: "metal gear solid 5",
  mgsv: "metal gear solid 5",
  re4: "resident evil 4",
};

function expandQuery(queryNorm: string): string | null {
  const parts = queryNorm.split(" ").filter(Boolean);
  let changed = false;
  const out: string[] = [];
  for (const part of parts) {
    if (Object.hasOwn(TOKEN_ALIAS, part)) {
      changed = true;
      out.push(TOKEN_ALIAS[part]);
    } else out.push(part);
  }
  if (!changed) return null;
  const expanded = out.join(" ");
  return expanded === queryNorm ? null : expanded;
}

const EXTRA: Record<string, readonly string[]> = {
  "grand theft auto v": ["gta 5", "gta v", "gta5", "gtav"],
  "grand theft auto vi": ["gta 6", "gta vi", "gta6"],
  "red dead redemption": ["rdr"],
  "red dead redemption 2": ["rdr2", "rdr 2"],
  "the last of us part i": ["tlou", "tlou1", "tlou 1"],
  "the last of us part ii": ["tlou", "tlou2", "tlou 2"],
  "the last of us remastered": ["tlou"],
  "the last of us complete": ["tlou"],
  "the last of us part ii remastered": ["tlou2", "tlou 2"],
  "god of war": ["gow"],
  "god of war ragnarok": ["gowr", "gow ragnarok"],
  "gran turismo 7": ["gt7", "gt 7"],
  "horizon zero dawn": ["hzd"],
  "horizon zero dawn remastered": ["hzd"],
  "horizon zero dawn complete edition": ["hzd"],
  "horizon forbidden west": ["hfw"],
  "monster hunter world": ["mhw"],
  "the witcher 3 wild hunt": ["tw3", "witcher 3"],
  "cyberpunk 2077": ["cp2077"],
  "no mans sky": ["nms"],
  "final fantasy vii": ["ff7", "ff 7"],
  "final fantasy vii remake": ["ff7", "ff7r"],
  "final fantasy vii rebirth": ["ff7"],
  "persona 5": ["p5"],
  "persona 5 royal": ["p5r"],
  "metal gear solid v the phantom pain": ["mgs5", "mgsv"],
  "resident evil 4": ["re4", "re 4"],
  "marvels spider man": ["spiderman", "spider man"],
  "marvels spider man 2": ["spiderman 2", "sm2"],
  "uncharted 4 a thiefs end": ["uc4"],
};

function extraFor(name: string): string[] {
  const norm = normalize(name);
  const out: string[] = [];
  if (Object.hasOwn(EXTRA, norm)) out.push(...EXTRA[norm]);
  if (!SIDE.test(norm)) {
    if (norm === "call of duty" || norm.startsWith("call of duty ")) out.push("cod");
    if (norm === "need for speed" || norm.startsWith("need for speed ")) out.push("nfs");
  }
  return out;
}

function sidePenalty(name: string, queryNorm: string): number {
  const normalized = normalize(name);
  if (!SIDE.test(normalized) || SIDE.test(queryNorm)) return 0;
  return 380;
}

function regionPenalty(game: Game): number {
  const known = new Set<Region>();
  for (const sku of game.skus) if (sku.region !== "?") known.add(sku.region);
  if (known.size === 0) return 420;
  if (known.size === 1) return 140;
  return 0;
}

type Prepared = {
  game: Game;
  forms: { norm: string; flat: string; tokens: string[] }[];
};

export type Index = {
  prepared: Prepared[];
  tokenToGames: Map<string, number[]>;
  prefixToGames: Map<string, number[]>;
  grams: Map<string, number[]>;
  ids: { id: string; gi: number; si: number }[];
};

export function buildIndex(games: Game[]): Index {
  const tokenToGames = new Map<string, number[]>();
  const prefixBuckets = new Map<string, number[]>();
  const gramBuckets = new Map<string, number[]>();
  const prepared: Prepared[] = [];
  const ids: { id: string; gi: number; si: number }[] = [];

  const add = (map: Map<string, number[]>, key: string, gi: number) => {
    let list = map.get(key);
    if (!list) {
      list = [];
      map.set(key, list);
    }
    if (list.length === 0 || list[list.length - 1] !== gi) list.push(gi);
  };

  games.forEach((game, gi) => {
    const texts = [game.name, ...game.aliases, ...extraFor(game.name)];
    const forms: Prepared["forms"] = [];
    const seenTokens = new Set<string>();
    const seenGrams = new Set<string>();
    for (const text of texts) {
      const norm = normalize(text);
      if (!norm) continue;
      const flat = norm.replace(/ /g, "");
      const tokens = tokensOf(norm);
      forms.push({ norm, flat, tokens });
      for (const token of tokens) {
        if (seenTokens.has(token)) continue;
        seenTokens.add(token);
        add(tokenToGames, token, gi);
        const maxPrefix = Math.min(8, token.length - 1);
        for (let len = 2; len <= maxPrefix; len++) add(prefixBuckets, token.slice(0, len), gi);
      }
      if (flat.length >= 4 && flat.length <= 40 && flat !== tokens.join("")) {
        if (!seenTokens.has(flat)) {
          seenTokens.add(flat);
          add(tokenToGames, flat, gi);
        }
      }
      if (flat.length >= 3) {
        for (const gram of new Set(gramsOf(flat))) {
          if (seenGrams.has(gram)) continue;
          seenGrams.add(gram);
          add(gramBuckets, gram, gi);
        }
      }
    }
    prepared.push({ game, forms });
    game.skus.forEach((sku, si) => {
      ids.push({ id: sku.id.toUpperCase(), gi, si });
    });
  });

  ids.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { prepared, tokenToGames, prefixToGames: prefixBuckets, grams: gramBuckets, ids };
}

function lowerBound(ids: Index["ids"], target: string): number {
  let lo = 0;
  let hi = ids.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ids[mid].id < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

type IdQuery = { id: string; exact: boolean };

export function titleQuery(raw: string): IdQuery | null {
  const upper = raw.toUpperCase();
  const embedded = [...upper.matchAll(/(CUSA|PPSA)[\s-]*(\d{3,6})(?:[\s_]*(\d{2}))?/g)];
  const full = embedded.filter((match) => match[2].length >= 5);
  // One complete title ID, including a content ID wrapped around it.
  if (full.length === 1 && embedded.length === 1) {
    const suffix = full[0][3] && full[0][3] !== "00" ? `_${full[0][3]}` : "";
    return { id: `${full[0][1]}${full[0][2]}${suffix}`, exact: true };
  }
  const compact = upper.replace(/[\s-]+/g, "");
  const match = compact.match(/^(CUSA|PPSA)(\d{3,6})(?:_(\d{2}))?$/);
  if (!match) return null;
  const suffix = match[3] && match[3] !== "00" ? `_${match[3]}` : "";
  return { id: `${match[1]}${match[2]}${suffix}`, exact: match[2].length >= 5 };
}

function skuVisible(sku: Sku, filters: Filters): boolean {
  if (filters.platform !== "all" && sku.platform !== filters.platform) return false;
  if (filters.region !== "all" && sku.region !== filters.region) return false;
  return true;
}

function searchIds(index: Index, query: IdQuery, filters: Filters): SearchHit[] {
  const start = lowerBound(index.ids, query.id);
  const hits = new Map<number, SearchHit>();
  for (let i = start; i < index.ids.length; i++) {
    const row = index.ids[i];
    if (query.exact) {
      if (row.id !== query.id) break;
    } else if (!row.id.startsWith(query.id)) {
      break;
    }
    const prepared = index.prepared[row.gi];
    const sku = prepared.game.skus[row.si];
    if (!query.exact && !skuVisible(sku, filters)) continue;
    let hit = hits.get(row.gi);
    if (!hit) {
      hit = { game: prepared.game, score: query.exact ? 2000 : 1000 - row.id.length, matched: [], viaId: true };
      hits.set(row.gi, hit);
    }
    hit.matched.push(sku.id);
    if (query.exact) hit.score += 10;
  }
  return [...hits.values()].sort((a, b) => b.score - a.score || a.game.name.localeCompare(b.game.name)).slice(0, 20);
}

type Kind = "exact" | "prefix" | "fuzzy";

function gamesForToken(index: Index, token: string): Map<number, Kind> {
  const out = new Map<number, Kind>();
  const exact = index.tokenToGames.get(token);
  if (exact) for (const gi of exact) out.set(gi, "exact");
  if (token.length >= 2) {
    const prefixed = index.prefixToGames.get(token);
    if (prefixed) {
      for (const gi of prefixed) if (!out.has(gi)) out.set(gi, "prefix");
    }
  }
  if (token.length >= 2) {
    for (const variant of fuzzyVariants(token)) {
      const list = index.tokenToGames.get(variant);
      if (!list) continue;
      for (const gi of list) if (!out.has(gi)) out.set(gi, "fuzzy");
    }
  }
  return out;
}

function scoreForm(
  form: { norm: string; flat: string; tokens: string[] },
  queryNorm: string,
  queryTokens: string[],
): { score: number; miss: number } {
  const nameNorm = foldRoman(form.norm);
  const nameFlat = nameNorm.replace(/ /g, "");
  const foldedQuery = foldRoman(queryNorm);
  const foldedFlat = foldedQuery.replace(/ /g, "");
  let score = 0;
  if (nameNorm === foldedQuery) score += 1000;
  else if (nameNorm.startsWith(foldedQuery)) score += 720;
  else if (nameFlat === foldedFlat) score += 700;
  else if (foldedFlat.length >= 4 && nameFlat.startsWith(foldedFlat)) score += 560;
  else if (foldedFlat.length >= 4 && nameFlat.includes(foldedFlat)) score += 420;

  let exact = 0;
  let prefix = 0;
  let fuzzy = 0;
  let miss = 0;
  const used = new Set<number>();
  for (const queryToken of queryTokens) {
    let kind: Kind | "miss" = "miss";
    for (let i = 0; i < form.tokens.length; i++) {
      if (used.has(i)) continue;
      if (form.tokens[i] === queryToken) {
        kind = "exact";
        used.add(i);
        break;
      }
    }
    if (kind === "miss") {
      for (let i = 0; i < form.tokens.length; i++) {
        if (used.has(i)) continue;
        let joined = "";
        const taken: number[] = [];
        for (let j = i; j < form.tokens.length; j++) {
          if (used.has(j)) break;
          const next = joined + form.tokens[j];
          if (!queryToken.startsWith(next)) break;
          joined = next;
          taken.push(j);
          if (joined === queryToken && taken.length > 1) {
            kind = "exact";
            for (const index of taken) used.add(index);
            break;
          }
        }
        if (kind === "exact") break;
      }
    }
    if (kind === "miss") {
      for (let i = 0; i < form.tokens.length; i++) {
        if (used.has(i)) continue;
        const nameToken = form.tokens[i];
        if (queryToken.length >= 2 && nameToken.startsWith(queryToken)) {
          kind = "prefix";
          used.add(i);
          break;
        }
      }
    }
    if (kind === "miss" && queryToken.length >= 2) {
      for (let i = 0; i < form.tokens.length; i++) {
        if (used.has(i)) continue;
        const nameToken = form.tokens[i];
        if (nameToken.length < 2) continue;
        if (nameToken[0] !== queryToken[0] && editDistance(nameToken, queryToken) > 1) continue;
        const distance = editDistance(nameToken, queryToken);
        if (distance <= 1) {
          const shorter = nameToken.length < queryToken.length ? nameToken : queryToken;
          const longer = nameToken.length < queryToken.length ? queryToken : nameToken;
          if (longer.startsWith(shorter) && longer.length - shorter.length === 1 && shorter.length <= 3) continue;
          kind = "fuzzy";
          used.add(i);
          break;
        }
      }
    }
    if (kind === "exact") exact++;
    else if (kind === "prefix") prefix++;
    else if (kind === "fuzzy") fuzzy++;
    else miss++;
  }

  score += exact * 80 + prefix * 58 + fuzzy * 46;
  score -= miss * 90;
  if (queryTokens.length > 0 && miss === 0) score += 100;
  score -= Math.max(0, form.tokens.length - queryTokens.length) * 16;
  if (foldedFlat.length >= 3 && nameFlat.length >= 3) score += Math.round(dice(foldedFlat, nameFlat) * 100);
  return { score, miss };
}

const PREFIX_WINDOW = 180;
const PREFIX_PENALTY = 120;

function preferCompleteDuplicates(pool: { hit: SearchHit }[]): void {
  const folded = pool.map((item) => foldRoman(normalize(item.hit.game.name)));
  const groups = new Map<string, number[]>();
  for (let i = 0; i < folded.length; i++) {
    const list = groups.get(folded[i]);
    if (list) list.push(i);
    else groups.set(folded[i], [i]);
  }
  // Only rows that collapse to the same title (Modern Warfare 2 / II) compete
  // on how many IDs they carry, and only those short duplicates yield to a
  // longer edition that is already within a small score window.
  const duplicate = new Set<number>();
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    for (const i of indexes) {
      duplicate.add(i);
      pool[i].hit.score += Math.min(pool[i].hit.game.skus.length, 20) * 4;
    }
  }
  for (const i of duplicate) {
    if (folded[i].length < 8) continue;
    for (let j = 0; j < pool.length; j++) {
      if (i === j || !folded[j].startsWith(`${folded[i]} `)) continue;
      const gap = pool[i].hit.score - pool[j].hit.score;
      if (gap >= 0 && gap <= PREFIX_WINDOW) {
        pool[i].hit.score -= PREFIX_PENALTY;
        break;
      }
    }
  }
}

// "fifa" ties FIFA 14 and FIFA 23; the trailing number is the only difference.
function seriesNumber(name: string, queryNorm: string): number | null {
  const tokens = tokensOf(foldRoman(normalize(name)));
  if (tokens.length < 2) return null;
  const last = tokens[tokens.length - 1];
  if (!/^\d{1,4}$/.test(last)) return null;
  const queryTokens = tokensOf(foldRoman(queryNorm));
  if (queryTokens.length === 0 || /^\d{1,4}$/.test(queryTokens[queryTokens.length - 1])) return null;
  if (queryTokens.join(" ") !== tokens.slice(0, -1).join(" ")) return null;
  return Number(last);
}

export function searchIndex(index: Index, raw: string, filters: Filters): SearchHit[] {
  const query = raw.trim();
  if (query.length < 2) return [];
  const asId = titleQuery(query);
  if (asId) {
    const idHits = searchIds(index, asId, filters);
    if (idHits.length || asId.exact) return idHits;
  }

  const queryNorm = normalize(query);
  const expanded = expandQuery(queryNorm);
  const variants = expanded ? [queryNorm, expanded] : [queryNorm];
  const bestByGame = new Map<number, { score: number; miss: number; queryNorm: string }>();

  for (const variant of variants) {
    const queryTokens = tokensOf(variant);
    const queryFlat = variant.replace(/ /g, "");
    if (!queryFlat) continue;

    const candidateScore = new Map<number, number>();
    const tokenMaps = queryTokens.map((token) => gamesForToken(index, token));
    if (tokenMaps.length) {
      let inter: Set<number> | null = null;
      for (const map of tokenMaps) {
        const keys = new Set<number>(map.keys());
        if (!inter) {
          inter = keys;
        } else {
          const next = new Set<number>();
          for (const gi of inter) if (keys.has(gi)) next.add(gi);
          inter = next;
        }
        if (inter.size === 0) break;
      }
      if (inter && inter.size) {
        for (const gi of inter) candidateScore.set(gi, 50);
      } else {
        for (const map of tokenMaps) {
          for (const gi of map.keys()) candidateScore.set(gi, (candidateScore.get(gi) ?? 0) + 1);
        }
      }
    }

    if (queryFlat.length >= 3) {
      const grams = gramsOf(queryFlat);
      const counts = new Map<number, number>();
      for (const gram of grams) {
        const list = index.grams.get(gram);
        if (!list) continue;
        for (const gi of list) counts.set(gi, (counts.get(gi) ?? 0) + 1);
      }
      const minShare = Math.max(2, Math.ceil(grams.length * 0.45));
      for (const [gi, count] of counts) {
        if (count >= minShare) candidateScore.set(gi, (candidateScore.get(gi) ?? 0) + count);
      }
    }

    const rankedCandidates = [...candidateScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 400);
    for (const [gi] of rankedCandidates) {
      const prepared = index.prepared[gi];
      if (!prepared.game.skus.some((sku) => skuVisible(sku, filters))) continue;
      let best = -Infinity;
      let miss = queryTokens.length || 1;
      for (const form of prepared.forms) {
        const result = scoreForm(form, variant, queryTokens);
        if (result.score > best || (result.score === best && result.miss < miss)) {
          best = result.score;
          miss = result.miss;
        }
      }
      if (best < 160) continue;
      const prev = bestByGame.get(gi);
      if (!prev || best > prev.score || (best === prev.score && miss < prev.miss)) {
        bestByGame.set(gi, { score: best, miss, queryNorm: variant });
      }
    }
  }

  const scored: { hit: SearchHit; miss: number }[] = [];
  for (const [gi, best] of bestByGame) {
    const prepared = index.prepared[gi];
    scored.push({
      hit: {
        game: prepared.game,
        score: best.score - sidePenalty(prepared.game.name, best.queryNorm) - regionPenalty(prepared.game),
        matched: [],
        viaId: false,
      },
      miss: best.miss,
    });
  }

  const clean = scored.filter((item) => item.miss === 0);
  const pool = clean.length ? clean : scored.filter((item) => item.miss <= 1);
  preferCompleteDuplicates(pool);
  pool.sort((a, b) => {
    if (b.hit.score !== a.hit.score) return b.hit.score - a.hit.score;
    const aNumber = seriesNumber(a.hit.game.name, queryNorm);
    const bNumber = seriesNumber(b.hit.game.name, queryNorm);
    if (aNumber !== null && bNumber !== null && aNumber !== bNumber) return bNumber - aNumber;
    return a.hit.game.name.localeCompare(b.hit.game.name);
  });
  const top = pool[0]?.hit.score ?? 0;
  const floor = top >= 1000 ? Math.max(450, top - 800) : 0;
  const visible = floor ? pool.filter((item) => item.hit.score >= floor) : pool;
  return visible.slice(0, 20).map((item) => item.hit);
}
