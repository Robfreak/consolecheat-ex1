export const tools = [
  {
    id: "titles",
    href: "https://robfreak.github.io/consolecheat-ex1/",
    de: "Title-ID-Finder",
    en: "Title ID finder",
  },
  {
    id: "plus",
    href: "https://robfreak.github.io/consolecheat-ex2/",
    de: "PS-Plus-Archiv",
    en: "PS Plus archive",
  },
  {
    id: "controller",
    href: "https://robfreak.github.io/consolecheat-ex3/",
    de: "Controller-Tester",
    en: "Controller tester",
  },
  {
    id: "saves",
    href: "https://robfreak.github.io/consolecheat-ex4/",
    de: "Save-Info-Leser",
    en: "Save info reader",
  },
  {
    id: "errors",
    href: "https://robfreak.github.io/consolecheat-ex5/",
    de: "Fehlercode-Nachschlager",
    en: "Error code lookup",
  },
  {
    id: "list",
    href: "https://robfreak.github.io/consolecheat-ex6/",
    de: "Spiele-Merkliste",
    en: "Game checklist",
  },
  {
    id: "screen",
    href: "https://robfreak.github.io/consolecheat-ex6/bildschirm/",
    de: "Bildschirm-Test",
    en: "Screen test",
  },
] as const;

export type ToolId = (typeof tools)[number]["id"];

export const currentToolId: ToolId = "titles";

const PLUS_ARCHIVE_HREF = "https://robfreak.github.io/consolecheat-ex2/";

export function toolLabel(lang: string, tool: { de: string; en: string }): string {
  return lang === "de" ? tool.de : tool.en;
}

export function footerTools(lang: string): { id: ToolId; href: string; label: string }[] {
  return tools
    .filter((tool) => tool.id !== currentToolId)
    .map((tool) => ({
      id: tool.id,
      href: tool.href,
      label: toolLabel(lang, tool),
    }));
}

export function plusArchiveHref(gameName: string): string {
  const url = new URL(PLUS_ARCHIVE_HREF);
  const name = gameName.trim();
  if (name) url.searchParams.set("q", name);
  return url.toString();
}
