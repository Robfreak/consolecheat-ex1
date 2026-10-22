import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Mark, MoonIcon, SunIcon } from "./icons";
import { LegalPage } from "./legal";
import {
  RTL,
  copy,
  detectLang,
  fill,
  isLang,
  languageOptions,
  type Copy,
  type Lang,
} from "./messages";
import {
  buildIndex,
  decodeTitles,
  searchIndex,
  type Filters,
  type Index,
  type Platform,
  type Region,
  type SearchHit,
  type Sku,
  type TitlesFile,
} from "./search";

const EXAMPLES = ["God of War", "Gran Turismo", "The Last of Us", "CUSA07820"];
const REGION_FILTERS: Region[] = ["EU", "US", "JP", "Asia", "KR", "INT"];

type Theme = "light" | "dark";
type Page = "home" | "impressum" | "datenschutz";

function readPage(): Page {
  const hash = location.hash.replace(/^#\/?/, "");
  if (hash === "impressum") return "impressum";
  if (hash === "datenschutz") return "datenschutz";
  return "home";
}

function readLang(): Lang {
  try {
    const stored = localStorage.getItem("consolecheat-lang");
    if (isLang(stored)) return stored;
    return detectLang(navigator.languages);
  } catch {
    return "de";
  }
}

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function applyLang(next: Lang) {
  document.documentElement.lang = next;
  document.documentElement.dir = RTL.has(next) ? "rtl" : "ltr";
  localStorage.setItem("consolecheat-lang", next);
}

function applyTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  localStorage.setItem("consolecheat-theme", next);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", next === "light" ? "#f4f1eb" : "#07090e");
}

function readQuery(): string {
  return new URLSearchParams(location.search).get("q") ?? "";
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.insetInlineStart = "-9999px";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function regionLong(t: Copy, region: Region): string {
  if (region === "EU") return t.regionEU;
  if (region === "US") return t.regionUS;
  if (region === "JP") return t.regionJP;
  if (region === "Asia") return t.regionAsia;
  if (region === "KR") return t.regionKR;
  if (region === "INT") return t.regionINT;
  return t.unknownRegion;
}

function regionClass(region: Region): string {
  if (region === "EU") return "region-pill region-eu";
  if (region === "US") return "region-pill region-us";
  if (region === "JP") return "region-pill region-jp";
  if (region === "Asia") return "region-pill region-asia";
  if (region === "KR") return "region-pill region-kr";
  if (region === "INT") return "region-pill region-int";
  return "region-pill region-unknown";
}

function regionText(t: Copy, sku: Sku): string {
  const label = regionLong(t, sku.region);
  return sku.tag ? `${label} · ${sku.tag}` : label;
}

function visibleSkus(hit: SearchHit, filters: Filters): Sku[] {
  if (hit.viaId) return hit.game.skus;
  return hit.game.skus.filter((sku) => {
    if (filters.platform !== "all" && sku.platform !== filters.platform) return false;
    if (filters.region !== "all" && sku.region !== filters.region) return false;
    return true;
  });
}

function skuLine(sku: Sku): string {
  const region = sku.tag ? `${sku.region} ${sku.tag}` : sku.region === "?" ? "?" : sku.region;
  return `${sku.id} ${region} ${sku.platform}`;
}

export function App() {
  const [lang, setLang] = useState<Lang>(readLang);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [query, setQuery] = useState(readQuery);
  const [platform, setPlatform] = useState<Filters["platform"]>("all");
  const [region, setRegion] = useState<Filters["region"]>("all");
  const [file, setFile] = useState<TitlesFile | null>(null);
  const [index, setIndex] = useState<Index | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [page, setPage] = useState<Page>(readPage);
  const deferred = useDeferredValue(query);
  const t = copy[lang];

  useEffect(() => {
    applyLang(lang);
  }, [lang]);

  useEffect(() => {
    const sync = () => setPage(readPage());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  useEffect(() => {
    const name = page === "impressum" ? "Impressum" : page === "datenschutz" ? "Datenschutz" : t.title;
    document.title = `${name} · consolecheat`;
    if (page !== "home") window.scrollTo(0, 0);
  }, [page, t.title]);

  useEffect(() => {
    const url = new URL(location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    if (`${url.pathname}${url.search}` !== `${location.pathname}${location.search}`) {
      history.replaceState(null, "", url);
    }
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const url = `${import.meta.env.BASE_URL}titles.json`;
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<TitlesFile>;
      })
      .then((payload) => {
        const games = decodeTitles(payload);
        setFile(payload);
        setIndex(buildIndex(games));
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(true);
      });
    return () => controller.abort();
  }, []);

  const filters = useMemo<Filters>(() => ({ platform, region }), [platform, region]);
  const hits = useMemo(() => (index ? searchIndex(index, deferred, filters) : []), [index, deferred, filters]);

  async function onCopy(value: string, token: string) {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(token);
    window.setTimeout(() => setCopied((current) => (current === token ? null : current)), 4000);
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="https://consolecheat.com" className="flex min-w-0 items-center gap-3">
            <Mark />
            <span className="truncate font-display text-lg font-semibold tracking-tight">{t.brand}</span>
          </a>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="lang">
              {t.language}
            </label>
            <select
              id="lang"
              value={lang}
              onChange={(event) => {
                if (isLang(event.target.value)) setLang(event.target.value);
              }}
              className="h-11 w-28 rounded-lg border border-line bg-surface px-2 text-sm text-fg sm:w-36"
            >
              {languageOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={theme === "dark" ? t.themeLight : t.themeDark}
              onClick={() => {
                const next = theme === "dark" ? "light" : "dark";
                setTheme(next);
                applyTheme(next);
              }}
              className="inline-flex size-11 items-center justify-center rounded-lg border border-line bg-surface text-fg"
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
      </header>

      {page === "home" ? (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="eyebrow text-xs font-medium uppercase text-steel">{t.eyebrow}</p>
        <h1 className="display-title mt-3 max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          {t.title}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">{t.lede}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <p className="panel rounded-xl px-4 py-4 text-base font-medium leading-relaxed text-fg">{t.freeClaim}</p>
          <p className="panel rounded-xl px-4 py-4 text-base font-medium leading-relaxed text-fg">{t.privacyClaim}</p>
        </div>
        <p className="mt-4 text-sm text-subtle">{t.unofficial}</p>

        <section className="mt-10 scroll-mt-28" aria-labelledby="search-heading">
          <div className="panel rounded-xl p-5 sm:p-6">
            <h2 id="search-heading" className="font-display text-2xl font-semibold tracking-tight">
              {t.searchLabel}
            </h2>
            <label htmlFor="q" className="sr-only">
              {t.searchLabel}
            </label>
            <div className="relative mt-2">
              <input
                id="q"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.placeholder}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                className="h-12 w-full rounded-lg border border-line bg-bg px-3 pe-12 text-base text-fg outline-none placeholder:text-subtle"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t.clear}
                  className="absolute end-1 top-1 inline-flex size-10 items-center justify-center rounded-lg text-lg text-muted"
                >
                  ×
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-subtle">{t.examples}</span>
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setQuery(example)}
                  className="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-fg"
                >
                  {example}
                </button>
              ))}
            </div>
            <div className="mt-5 flex flex-col gap-3">
              <FilterRow
                label={t.platformLabel}
                value={platform}
                onChange={setPlatform}
                options={[
                  ["all", t.filterAll],
                  ["PS4", "PS4"],
                  ["PS5", "PS5"],
                ]}
              />
              <FilterRow
                label={t.regionsLabel}
                value={region}
                onChange={setRegion}
                options={[
                  ["all", t.filterAll],
                  ...REGION_FILTERS.map((item) => [item, regionLong(t, item)] as const),
                ]}
              />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">{t.hint}</p>
            <p className="mt-1 text-sm text-subtle">{t.prepare}</p>
            {file ? (
              <p className="mt-3 text-sm text-subtle">
                {fill(t.stats, { games: file.games.toLocaleString(lang), ids: file.ids.toLocaleString(lang) })}
              </p>
            ) : null}
          </div>

          <div className="mt-4" aria-live="polite">
            {!index && !error ? <p className="panel rounded-xl px-5 py-8 text-muted">{t.loading}</p> : null}
            {error ? <p className="panel rounded-xl px-5 py-8 text-muted">{t.loadError}</p> : null}
            {index && query.trim().length === 1 ? <p className="panel rounded-xl px-5 py-8 text-muted">{t.tooShort}</p> : null}
            {index && query.trim().length >= 2 ? (
              <>
                <p className="mb-3 text-sm text-subtle">{fill(t.results, { n: hits.length })}</p>
                {hits.length === 0 ? <p className="panel rounded-xl px-5 py-8 text-muted">{t.empty}</p> : null}
                <ul className="flex flex-col gap-3">
                  {hits.map((hit) => (
                    <ResultCard
                      key={`${hit.game.name}:${hit.game.skus[0]?.id ?? ""}`}
                      hit={hit}
                      t={t}
                      filters={filters}
                      copied={copied}
                      onCopy={onCopy}
                    />
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </section>
      </main>
      ) : (
        <LegalPage
          page={page}
          homeHref={`${import.meta.env.BASE_URL}${location.search}`}
          onHome={(event) => {
            event.preventDefault();
            history.pushState(null, "", `${location.pathname}${location.search}`);
            setPage("home");
            window.scrollTo(0, 0);
          }}
        />
      )}

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm leading-relaxed text-subtle sm:px-6">
          <p className="text-fg">{t.brand}</p>
          <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Impressum und Datenschutz">
            <a href="#impressum" className="text-steel underline-offset-4 hover:underline">
              Impressum
            </a>
            <a href="#datenschutz" className="text-steel underline-offset-4 hover:underline">
              Datenschutz
            </a>
          </nav>
          <p>{t.freeClaim}</p>
          <p>{t.privacyClaim}</p>
          <p>{t.footerNote}</p>
          {file ? (
            <p>
              <a
                href={file.source}
                className="text-steel underline-offset-4 hover:underline"
              >
                {t.source}
              </a>
              {file.commit ? ` · ${file.commit.slice(0, 7)}` : ""} · {file.license}
              {file.generated ? ` · ${file.generated}` : ""}
            </p>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

function FilterRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <span className="w-28 shrink-0 text-sm text-subtle">{label}</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map(([id, text]) => {
          const on = value === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(id)}
              className={
                on
                  ? "h-11 rounded-lg border border-accent bg-accent px-4 text-sm font-medium text-accent-fg"
                  : "h-11 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-fg"
              }
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResultCard({
  hit,
  t,
  filters,
  copied,
  onCopy,
}: {
  hit: SearchHit;
  t: Copy;
  filters: Filters;
  copied: string | null;
  onCopy: (value: string, token: string) => void;
}) {
  const skus = visibleSkus(hit, filters);
  const matched = new Set(hit.matched);
  const ps4 = skus.filter((sku) => sku.platform === "PS4");
  const ps5 = skus.filter((sku) => sku.platform === "PS5");
  const allToken = `all:${hit.game.name}:${hit.game.skus[0]?.id ?? ""}`;

  return (
    <li className="panel rounded-xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl font-semibold tracking-tight">{hit.game.name}</h3>
          <p className="mt-1 text-sm text-subtle">{fill(t.showIds, { n: skus.length })}</p>
          {hit.game.aliases.length ? (
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {t.also}: {hit.game.aliases.join(", ")}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onCopy(skus.map(skuLine).join("\n"), allToken)}
          className="inline-flex h-11 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-fg"
        >
          {copied === allToken ? t.copied : t.copyAll}
        </button>
      </div>
      <PlatformBlock platform="PS4" skus={ps4} t={t} matched={matched} copied={copied} onCopy={onCopy} />
      <PlatformBlock platform="PS5" skus={ps5} t={t} matched={matched} copied={copied} onCopy={onCopy} />
    </li>
  );
}

function PlatformBlock({
  platform,
  skus,
  t,
  matched,
  copied,
  onCopy,
}: {
  platform: Platform;
  skus: Sku[];
  t: Copy;
  matched: Set<string>;
  copied: string | null;
  onCopy: (value: string, token: string) => void;
}) {
  if (!skus.length) return null;
  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold tracking-wide text-subtle">{platform}</h4>
      <ul className="mt-2 flex flex-col gap-2">
        {skus.map((sku) => {
          const token = sku.id;
          const on = matched.has(sku.id);
          const done = copied === token;
          return (
            <li key={sku.id}>
              <button
                type="button"
                onClick={() => onCopy(sku.id, token)}
                aria-label={fill(t.copyId, { id: sku.id })}
                className={
                  "flex w-full flex-wrap items-center gap-2 rounded-lg bg-raised px-3 py-2 text-left " +
                  (on ? "ring-2 ring-accent" : "")
                }
              >
                <span className={regionClass(sku.region)} title={sku.region === "?" ? t.unknownHint : regionLong(t, sku.region)}>
                  {regionText(t, sku)}
                </span>
                <span className="min-h-11 px-1 font-mono text-base font-semibold tracking-wide text-fg">
                  {sku.id}
                  {done ? ` · ${t.copied}` : ""}
                </span>
                <span className="ms-auto inline-flex h-11 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-fg">
                  {done ? t.copied : t.copy}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
