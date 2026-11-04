import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { copy, fill, languageOptions } from "./messages.ts";
import { currentToolId, footerTools, plusArchiveHref, toolLabel, tools } from "./tools.ts";

const OTHER_TOOLS = [
  ["plus", "https://robfreak.github.io/consolecheat-ex2/", "PS-Plus-Archiv", "PS Plus archive"],
  ["controller", "https://robfreak.github.io/consolecheat-ex3/", "Controller-Tester", "Controller tester"],
  ["saves", "https://robfreak.github.io/consolecheat-ex4/", "Save-Info-Leser", "Save info reader"],
  ["errors", "https://robfreak.github.io/consolecheat-ex5/", "Fehlercode-Nachschlager", "Error code lookup"],
  ["list", "https://robfreak.github.io/consolecheat-ex6/", "Spiele-Merkliste", "Game checklist"],
  ["screen", "https://robfreak.github.io/consolecheat-ex6/bildschirm/", "Bildschirm-Test", "Screen test"],
] as const;

test("footer links to the other tools, with German and English labels, and omits this one", () => {
  assert.equal(currentToolId, "titles");
  assert.equal(tools[0].href, "https://robfreak.github.io/consolecheat-ex1/");
  assert.deepEqual(
    tools.slice(1).map((tool) => [tool.id, tool.href, tool.de, tool.en]),
    OTHER_TOOLS.map((row) => [...row]),
  );

  for (const lang of ["de", "en", "fr", "ja"]) {
    const listed = footerTools(lang);
    assert.deepEqual(
      listed.map((tool) => tool.id),
      OTHER_TOOLS.map((row) => row[0]),
      lang,
    );
    assert.equal(
      listed.some((tool) => tool.id === "titles" || tool.href.includes("consolecheat-ex1")),
      false,
      lang,
    );
    for (const tool of listed) {
      const url = new URL(tool.href);
      assert.equal(url.origin, "https://robfreak.github.io");
      assert.equal(url.search, "");
      assert.equal(url.hash, "");
      assert.equal(tool.label, lang === "de" ? tools.find((item) => item.id === tool.id)?.de : tools.find((item) => item.id === tool.id)?.en);
    }
  }

  const plus = tools.find((tool) => tool.id === "plus");
  assert.ok(plus);
  assert.equal(toolLabel("de", plus), "PS-Plus-Archiv");
  assert.equal(toolLabel("en", plus), "PS Plus archive");
  assert.equal(toolLabel("fr", plus), "PS Plus archive");
});

test("a result links to the PS Plus archive with the game name, and not to the error-code tool", () => {
  assert.equal(plusArchiveHref("God of War"), "https://robfreak.github.io/consolecheat-ex2/?q=God+of+War");
  assert.equal(
    plusArchiveHref("Marvel's Spider-Man"),
    "https://robfreak.github.io/consolecheat-ex2/?q=Marvel%27s+Spider-Man",
  );
  assert.equal(
    plusArchiveHref("FINAL FANTASY X/X-2 HD Remaster"),
    "https://robfreak.github.io/consolecheat-ex2/?q=FINAL+FANTASY+X%2FX-2+HD+Remaster",
  );
  assert.equal(plusArchiveHref("a&b=c"), "https://robfreak.github.io/consolecheat-ex2/?q=a%26b%3Dc");
  assert.equal(plusArchiveHref("  God of War  "), "https://robfreak.github.io/consolecheat-ex2/?q=God+of+War");
  assert.equal(plusArchiveHref("   "), "https://robfreak.github.io/consolecheat-ex2/");
  assert.equal(plusArchiveHref("").includes("consolecheat-ex5"), false);

  const errors = footerTools("de").find((tool) => tool.id === "errors");
  assert.equal(errors?.href, "https://robfreak.github.io/consolecheat-ex5/");
  assert.equal(new URL(errors?.href ?? "").search, "");
});

test("cross-link copy exists in every language", () => {
  assert.equal(copy.de.moreTools, "Weitere Werkzeuge");
  assert.equal(copy.en.moreTools, "More tools");
  assert.equal(copy.de.plusArchive, "Im PS-Plus-Archiv");
  assert.equal(copy.en.plusArchive, "In the PS Plus archive");
  assert.equal(fill(copy.de.plusArchiveFor, { name: "God of War" }), "God of War im PS-Plus-Archiv");
  assert.equal(fill(copy.en.plusArchiveFor, { name: "God of War" }), "God of War in the PS Plus archive");
  assert.notEqual(copy.fr.moreTools, copy.en.moreTools);
  assert.notEqual(copy.ja.moreTools, copy.en.moreTools);

  for (const { id } of languageOptions) {
    assert.notEqual(copy[id].moreTools.trim(), "", id);
    assert.notEqual(copy[id].plusArchive.trim(), "", id);
    assert.match(copy[id].plusArchiveFor, /\{name\}/, id);
    assert.equal(fill(copy[id].plusArchiveFor, { name: "God of War" }).includes("{"), false, id);
    assert.equal(copy[id].moreTools.includes("{"), false, id);
    assert.equal(copy[id].plusArchive.includes("{"), false, id);
  }
});

test("the page wires the footer and the result link, and leaves the intro alone", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const header = app.slice(app.indexOf("<header"), app.indexOf("</header>"));
  const intro = app.slice(app.indexOf("<main"), app.indexOf('aria-live="polite"'));
  const footer = app.slice(app.indexOf("<footer"), app.indexOf("</footer>"));
  const card = app.slice(app.indexOf("function ResultCard"), app.indexOf("function PlatformBlock"));

  assert.match(header, /https:\/\/consolecheat\.com/);
  assert.doesNotMatch(header, /consolecheat-ex[2-6]/);
  assert.doesNotMatch(intro, /robfreak\.github\.io/);
  assert.match(footer, /footerTools\(lang\)/);
  assert.match(footer, /t\.moreTools/);
  assert.doesNotMatch(footer, /plusArchiveHref/);
  assert.match(card, /plusArchiveHref\(hit\.game\.name\)/);
  assert.match(card, /t\.plusArchive/);
  assert.doesNotMatch(card, /consolecheat-ex5|Fehlercode|footerTools/);
  assert.doesNotMatch(app, /gtag|google-analytics|plausible|umami|googletagmanager/i);
});
