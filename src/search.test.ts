import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { buildIndex, decodeTitles, searchIndex, type TitlesFile } from "./search.ts";

const file = JSON.parse(readFileSync(new URL("../public/titles.json", import.meta.url), "utf8")) as TitlesFile;
const games = decodeTitles(file);
const index = buildIndex(games);
const all = { platform: "all" as const, region: "all" as const };

function names(query: string, limit = 8): string[] {
  return searchIndex(index, query, all)
    .slice(0, limit)
    .map((hit) => hit.game.name);
}

test("typo and partial: god of wr finds God of War first, with every region", () => {
  const hits = searchIndex(index, "god of wr", all);
  assert.equal(hits[0]?.game.name, "God of War");
  const regions = new Set(hits[0].game.skus.map((sku) => sku.region));
  for (const region of ["EU", "US", "JP", "Asia"]) assert.ok(regions.has(region), region);
  assert.ok(hits[0].game.skus.some((sku) => sku.id === "CUSA07408"));
  assert.ok(hits[0].game.skus.some((sku) => sku.id === "CUSA07410"));
  assert.ok(!hits[0].game.skus.some((sku) => sku.id === "CUSA09943"));
});

test("gran turismo lists Gran Turismo 7 and its regions", () => {
  const hits = searchIndex(index, "gran turismo", all);
  assert.equal(hits[0]?.game.name, "Gran Turismo 7");
  assert.ok(names("gran turismo").includes("Gran Turismo 7"));
  const gt = hits.find((hit) => hit.game.name === "Gran Turismo 7");
  assert.ok(gt);
  const regions = new Set(gt.game.skus.map((sku) => sku.region));
  assert.ok(regions.has("EU") && regions.has("US") && regions.has("Asia"));
  assert.ok(gt.game.skus.some((sku) => sku.id === "PPSA01317" && sku.platform === "PS5"));
  assert.ok(gt.game.skus.some((sku) => sku.id === "CUSA24769" && sku.platform === "PS4"));
});

test("the last of us returns the multi-region Part II card", () => {
  const hits = searchIndex(index, "the last of us", all);
  const part2 = hits.find((hit) => hit.game.skus.some((sku) => sku.id === "CUSA07820"));
  assert.ok(part2, names("the last of us").join(" | "));
  assert.equal(part2.game.name, "The Last of Us Part II");
  const byId = new Map(part2.game.skus.map((sku) => [sku.id, sku.region]));
  assert.equal(byId.get("CUSA07820"), "US");
  assert.equal(byId.get("CUSA10249"), "EU");
  assert.equal(byId.get("CUSA13986"), "JP");
  assert.equal(byId.get("CUSA14006"), "Asia");
});

test("reverse lookup by CUSA and by a pasted content ID", () => {
  const hits = searchIndex(index, "CUSA07820", all);
  assert.equal(hits[0]?.game.name, "The Last of Us Part II");
  assert.deepEqual(hits[0].matched, ["CUSA07820"]);
  assert.equal(hits[0].viaId, true);
  const pasted = searchIndex(index, "EP9000-CUSA07410_00-00000000GODOFWAR", all);
  assert.equal(pasted[0]?.game.name, "God of War");
  assert.ok(pasted[0].matched.includes("CUSA07410"));
  const spaced = searchIndex(index, "ppsa 01317", all);
  assert.equal(spaced[0]?.game.name, "Gran Turismo 7");
});

test("partial id and a one-character typo still resolve", () => {
  const partial = searchIndex(index, "cusa0741", all);
  assert.ok(partial.some((hit) => hit.game.name === "God of War"));
  const typo = searchIndex(index, "lasst of us", all);
  assert.ok(
    typo.some((hit) => hit.game.name === "The Last of Us Part II"),
    typo.map((hit) => hit.game.name).slice(0, 6).join(" | "),
  );
  const swapped = searchIndex(index, "god of wra", all);
  assert.equal(swapped[0]?.game.name, "God of War");
});

test("platform filter keeps PS5 ids for Gran Turismo 7", () => {
  const hits = searchIndex(index, "gran turismo 7", { platform: "PS5", region: "all" });
  assert.equal(hits[0]?.game.name, "Gran Turismo 7");
  assert.ok(hits[0].game.skus.some((sku) => sku.platform === "PS5"));
});

test("spiderman ranks the base game above VR", () => {
  for (const query of ["spiderman", "spider man", "spider-man"]) {
    const found = names(query, 12);
    assert.equal(found[0], "Marvel's Spider-Man", `${query}: ${found.join(" | ")}`);
    assert.ok(found.slice(0, 3).every((name) => !/\bVR\b/.test(name)), found.join(" | "));
  }
});

test("common aliases hit the main game", () => {
  assert.equal(names("gta 5")[0], "Grand Theft Auto V");
  assert.equal(names("gta v")[0], "Grand Theft Auto V");
  assert.equal(names("gta5")[0], "Grand Theft Auto V");
  assert.equal(names("gtav")[0], "Grand Theft Auto V");
  assert.equal(names("rdr2")[0], "Red Dead Redemption 2");
  assert.equal(names("rdr 2")[0], "Red Dead Redemption 2");
  assert.equal(names("tlou2")[0], "The Last of Us Part II");
  assert.equal(names("tlou")[0], "The Last of Us Part I");
  const cod = names("cod")[0];
  assert.match(cod, /^Call of Duty/);
  assert.doesNotMatch(cod, /DEMO|Beta|Trial/i);
  assert.equal(names("gow")[0], "God of War");
  assert.equal(names("gt7")[0], "Gran Turismo 7");
  assert.equal(names("hzd")[0], "Horizon Zero Dawn");
  assert.equal(names("nfs")[0], "Need for Speed");
  const blood = searchIndex(index, "CUSA00208", all)[0];
  assert.equal(blood.game.skus.find((sku) => sku.id === "CUSA00208")?.tag, "UK");
});

test("short aliases prefer the main game over unknown stubs and fuzzy noise", () => {
  const tlou = searchIndex(index, "tlou", all);
  assert.notEqual(tlou[0]?.game.name, "The Last of Us Complete");
  assert.ok(tlou[0]?.game.skus.some((sku) => sku.region !== "?"));
  const cod = searchIndex(index, "cod", all);
  const codRegions = new Set(cod[0]?.game.skus.map((sku) => sku.region).filter((region) => region !== "?"));
  assert.ok(codRegions.size >= 2, cod[0]?.game.name);
  const mw = names("cod mw2");
  assert.ok(mw.length > 0, "cod mw2 returned nothing");
  assert.match(mw[0], /modern warfare (2|ii)/i);
  const gow = names("gow", 12);
  assert.equal(gow[0], "God of War");
  assert.ok(!gow.some((name) => name === "HBO GO" || name === "Sky Go" || name === "Go To Work"), gow.join(" | "));
  assert.equal(names("uncharted 4")[0], "Uncharted 4: A Thief's End");
});

test("mw2 ranks the known releases above the odd digit-titled record", () => {
  const found = names("mw2", 12);
  const odd = found.findIndex((name) => name === "Call of Duty Modern Warfare 2");
  const remaster = found.findIndex((name) => /modern warfare 2 campaign remastered/i.test(name));
  const mwii = found.findIndex((name) => /^Call of Duty: Modern Warfare II$/.test(name));
  assert.ok(odd >= 0 && remaster >= 0 && mwii >= 0, found.join(" | "));
  assert.ok(remaster < odd, found.join(" | "));
  assert.ok(mwii < odd, found.join(" | "));
  assert.match(names("cod mw2")[0], /modern warfare (2|ii)/i);
  assert.equal(names("gow")[0], "God of War");
  assert.equal(names("tlou")[0], "The Last of Us Part I");
  assert.equal(names("uncharted 4")[0], "Uncharted 4: A Thief's End");
});

test("a numbered series lists the newest entry first", () => {
  const found = names("fifa", 20);
  const numbered = found.filter((name) => /^FIFA \d+$/.test(name));
  const years = numbered.map((name) => Number(name.slice(5)));
  assert.deepEqual(years, [...years].sort((a, b) => b - a), found.join(" | "));
  assert.ok(years.includes(23) && years.includes(14), found.join(" | "));
  assert.ok(years.indexOf(23) < years.indexOf(14), found.join(" | "));
  assert.ok(years[0] >= 23, found.join(" | "));
  assert.equal(names("fifa 14")[0], "FIFA 14");
});

test("titles.json stays compact", () => {
  const raw = readFileSync(new URL("../public/titles.json", import.meta.url));
  assert.ok(raw.length < 1_500_000, `raw ${raw.length}`);
  const gzip = gzipSync(raw).length;
  assert.ok(gzip < 520_000, `gzip ${gzip}`);
  assert.equal(file.format, 2);
  assert.equal(games.length, file.games);
  assert.equal(games.reduce((sum, game) => sum + game.skus.length, 0), file.ids);
});
