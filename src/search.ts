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
  source: string;
  commit: string;
  license: string;
  generated: string;
  games: number;
  ids: number;
  titles: CompactGame[];
};

type CompactSku = [string, string, string, string?];
type CompactGame = [string, string[] | null, CompactSku[]];

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

const REGIONS = new Set<Region>(["EU", "US", "JP", "Asia", "KR", "INT", "?"]);

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

const ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789";

export function decodeTitles(file: TitlesFile): Game[] {
  return file.titles.map(([name, aliases, skus]) => ({
    name,
    aliases: aliases ?? [],
    skus: skus.map(([id, region, platform, tag]) => ({
      id,
      region: REGIONS.has(region as Region) ? (region as Region) : "?",
      platform: platform === "5" ? "PS5" : "PS4",
      tag: tag || undefined,
    })),
  }));
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
    const texts = [game.name, ...game.aliases];
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
  queryFlat: string,
  queryTokens: string[],
): { score: number; miss: number } {
  let score = 0;
  if (form.norm === queryNorm) score += 1000;
  else if (form.norm.startsWith(queryNorm)) score += 720;
  else if (form.flat === queryFlat) score += 700;
  else if (queryFlat.length >= 4 && form.flat.startsWith(queryFlat)) score += 560;
  else if (queryFlat.length >= 4 && form.flat.includes(queryFlat)) score += 420;

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
  if (queryFlat.length >= 3 && form.flat.length >= 3) score += Math.round(dice(queryFlat, form.flat) * 100);
  return { score, miss };
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
  const queryTokens = tokensOf(queryNorm);
  const queryFlat = queryNorm.replace(/ /g, "");
  if (!queryFlat) return [];

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
  const scored: { hit: SearchHit; miss: number }[] = [];
  for (const [gi] of rankedCandidates) {
    const prepared = index.prepared[gi];
    if (!prepared.game.skus.some((sku) => skuVisible(sku, filters))) continue;
    let best = -Infinity;
    let miss = queryTokens.length || 1;
    for (const form of prepared.forms) {
      const result = scoreForm(form, queryNorm, queryFlat, queryTokens);
      if (result.score > best) {
        best = result.score;
        miss = result.miss;
      }
    }
    if (best < 160) continue;
    scored.push({
      hit: { game: prepared.game, score: best, matched: [], viaId: false },
      miss,
    });
  }

  const clean = scored.filter((item) => item.miss === 0);
  const pool = clean.length ? clean : scored.filter((item) => item.miss <= 1);
  pool.sort((a, b) => b.hit.score - a.hit.score || a.hit.game.name.localeCompare(b.hit.game.name));
  return pool.slice(0, 20).map((item) => item.hit);
}
