import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
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
