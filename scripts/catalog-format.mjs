/**
 * Compact catalog format 2.
 * Keep this encoder/decoder in sync with decodeTitles() in src/search.ts.
 *
 * names: one front-coded row per game, "keep<TAB>suffix", rows separated by newlines.
 * aliases: game index → original alternate names from the dataset.
 * skus: title IDs sorted by prefix and number, delta-coded.
 *   absolute: C|P + 5 digits + region letter + platform + optional tag + @gameIndex
 *   delta:    positive integer + region letter + platform + optional tag + @gameIndex
 * Region letters: E EU, U US, J JP, H Asia, K KR, I INT, ? unknown.
 * Platform is 4 or 5. The C/P prefix is CUSA/PPSA. Tags are the short codes already on the row (UK, AU, …).
 */

export const REGION_CHAR = {
  EU: "E",
  US: "U",
  JP: "J",
  Asia: "H",
  KR: "K",
  INT: "I",
  "?": "?",
};

export const REGION_FROM = {
  E: "EU",
  U: "US",
  J: "JP",
  H: "Asia",
  K: "KR",
  I: "INT",
  "?": "?",
};

function skuKey(sku) {
  return [sku.id, sku.region, sku.platform, sku.tag || ""].join("|");
}

export function encodeNames(names) {
  let prev = "";
  const lines = [];
  for (const name of names) {
    if (name.includes("\n") || name.includes("\r") || name.includes("\t")) {
      throw new Error(`Title name cannot be encoded: ${JSON.stringify(name)}`);
    }
    let keep = 0;
    const max = Math.min(prev.length, name.length);
    while (keep < max && prev[keep] === name[keep]) keep++;
    lines.push(`${keep}\t${name.slice(keep)}`);
    prev = name;
  }
  return lines.join("\n");
}

export function decodeNames(text) {
  if (!text) return [];
  const names = [];
  let prev = "";
  for (const line of text.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 0) throw new Error("Bad name row");
    const keep = Number(line.slice(0, tab));
    const name = prev.slice(0, keep) + line.slice(tab + 1);
    names.push(name);
    prev = name;
  }
  return names;
}

export function encodeSkus(games) {
  const rows = [];
  games.forEach((game, gi) => {
    for (const sku of game.skus) {
      const match = sku.id.match(/^(CUSA|PPSA)(\d{5})$/);
      if (!match) throw new Error(`Unexpected title ID: ${sku.id}`);
      const region = REGION_CHAR[sku.region];
      if (!region) throw new Error(`Unexpected region: ${sku.region}`);
      if (sku.platform !== "4" && sku.platform !== "5") throw new Error(`Unexpected platform: ${sku.platform}`);
      const tag = sku.tag || "";
      if (tag && !/^[A-Z0-9]{2,4}$/.test(tag)) throw new Error(`Unexpected tag: ${tag}`);
      rows.push({
        prefix: match[1] === "PPSA" ? "P" : "C",
        num: Number(match[2]),
        region,
        platform: sku.platform,
        tag,
        gi,
      });
    }
  });
  rows.sort((a, b) => (a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : a.num - b.num));
  let prevPrefix = "";
  let prevNum = 0;
  const lines = [];
  for (const row of rows) {
    let head;
    if (row.prefix !== prevPrefix) {
      head = row.prefix + String(row.num).padStart(5, "0");
      prevPrefix = row.prefix;
    } else {
      const delta = row.num - prevNum;
      if (delta <= 0) throw new Error(`Title ID delta was ${delta}`);
      head = String(delta);
    }
    prevNum = row.num;
    lines.push(`${head}${row.region}${row.platform}${row.tag}@${row.gi}`);
  }
  return lines.join("\n");
}

export function decodeSkus(text, count) {
  const grouped = Array.from({ length: count }, () => []);
  if (!text) return grouped;
  let prefix = "";
  let num = 0;
  for (const line of text.split("\n")) {
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
    const region = REGION_FROM[line[i]];
    if (!region) throw new Error(`Bad region in ${line}`);
    const platform = line[i + 1];
    if (platform !== "4" && platform !== "5") throw new Error(`Bad platform in ${line}`);
    const at = line.indexOf("@", i + 2);
    if (at < 0) throw new Error(`Bad sku row ${line}`);
    const tag = line.slice(i + 2, at);
    const gi = Number(line.slice(at + 1));
    const id = `${prefix === "P" ? "PPSA" : "CUSA"}${String(num).padStart(5, "0")}`;
    grouped[gi].push({ id, region, platform, tag });
  }
  return grouped;
}

export function encodeCatalog(games, meta) {
  const names = games.map((game) => game.name);
  /** @type {Record<string, string[]>} */
  const aliases = {};
  games.forEach((game, gi) => {
    if (game.aliases && game.aliases.length) aliases[String(gi)] = game.aliases;
  });
  const skuText = encodeSkus(games);
  const ids = games.reduce((sum, game) => sum + game.skus.length, 0);
  return {
    format: 2,
    source: meta.source,
    commit: meta.commit,
    license: meta.license,
    generated: meta.generated,
    games: names.length,
    ids,
    names: encodeNames(names),
    aliases,
    skus: skuText,
  };
}

export function decodeCatalog(payload) {
  const names = decodeNames(payload.names);
  const grouped = decodeSkus(payload.skus, names.length);
  return names.map((name, gi) => ({
    name,
    aliases: payload.aliases?.[String(gi)] ?? [],
    skus: grouped[gi],
  }));
}

export function assertRoundTrip(games, payload) {
  const decoded = decodeCatalog(payload);
  if (decoded.length !== games.length) {
    throw new Error(`Round-trip game count ${decoded.length} != ${games.length}`);
  }
  if (payload.ids !== games.reduce((sum, game) => sum + game.skus.length, 0)) {
    throw new Error("Round-trip id count");
  }
  for (let i = 0; i < games.length; i++) {
    if (decoded[i].name !== games[i].name) throw new Error(`Round-trip name ${i}`);
    const aliases = games[i].aliases || [];
    const back = decoded[i].aliases || [];
    if (aliases.length !== back.length || aliases.some((alias, idx) => alias !== back[idx])) {
      throw new Error(`Round-trip aliases for ${games[i].name}`);
    }
    const left = games[i].skus.map(skuKey).sort();
    const right = decoded[i].skus.map(skuKey).sort();
    if (left.length !== right.length || left.some((value, idx) => value !== right[idx])) {
      throw new Error(`Round-trip SKUs for ${games[i].name}`);
    }
  }
}
