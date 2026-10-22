function Slot({ children }: { children: string }) {
  return <span className="legal-slot">{children}</span>;
}

export function LegalPage({
  page,
  homeHref,
  onHome,
}: {
  page: "impressum" | "datenschutz";
  homeHref: string;
  onHome: (event: { preventDefault: () => void }) => void;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p>
        <a href={homeHref} onClick={onHome} className="text-sm font-medium text-steel underline-offset-4 hover:underline">
          Title-ID-Finder
        </a>
      </p>
      {page === "impressum" ? <Impressum /> : <Datenschutz />}
    </main>
  );
}

function Impressum() {
  return (
    <article id="impressum" className="mt-6">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Impressum</h1>
      <p className="mt-3 text-lg text-muted">Legal notice</p>
      <div lang="de" className="mt-8 flex flex-col gap-4 text-base leading-relaxed text-muted">
        <p className="panel rounded-xl px-4 py-4 text-fg">
          Platzhalter. Die markierten Felder sind keine echten Angaben. Es sind keine Namen, Adressen oder
          Kontaktdaten erfunden. Die betreibende Person setzt hier die eigenen Angaben ein.
        </p>
        <p>
          Anbieter: <Slot>[Name einsetzen]</Slot>
        </p>
        <p>
          Anschrift: <Slot>[Straße und Hausnummer einsetzen]</Slot>
        </p>
        <p>
          <Slot>[Postleitzahl und Ort einsetzen]</Slot>
        </p>
        <p>
          <Slot>[Land einsetzen]</Slot>
        </p>
        <p>
          E-Mail: <Slot>[E-Mail-Adresse einsetzen]</Slot>
        </p>
        <p>
          Telefon: <Slot>[Telefonnummer einsetzen]</Slot>
        </p>
        <p>
          Weitere Angaben, nur falls vorhanden (Registereintrag, Umsatzsteuer-ID, vertretungsberechtigte Person):{" "}
          <Slot>[falls vorhanden einsetzen]</Slot>
        </p>
        <p>Diese Seite ist ein inoffizielles Werkzeug. Nicht von Sony.</p>
      </div>
      <div lang="en" className="mt-10 flex flex-col gap-4 border-t border-line pt-8 text-base leading-relaxed text-muted">
        <p className="text-fg">Placeholders. The marked fields are not real details. No name, address, or contact was invented. The operator replaces them with their own details.</p>
        <p>
          Provider: <Slot>[insert name]</Slot>
        </p>
        <p>
          Address: <Slot>[insert street and house number]</Slot>
        </p>
        <p>
          <Slot>[insert postal code and city]</Slot>
        </p>
        <p>
          <Slot>[insert country]</Slot>
        </p>
        <p>
          Email: <Slot>[insert email address]</Slot>
        </p>
        <p>
          Phone: <Slot>[insert phone number]</Slot>
        </p>
        <p>
          Further details, only if they exist (register, VAT id, person authorized to represent):{" "}
          <Slot>[insert if applicable]</Slot>
        </p>
        <p>This site is an unofficial tool. Not Sony.</p>
      </div>
    </article>
  );
}

function Datenschutz() {
  return (
    <article id="datenschutz" className="mt-6">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Datenschutz</h1>
      <p className="mt-3 text-lg text-muted">Privacy</p>
      <div lang="de" className="mt-8 flex flex-col gap-4 text-base leading-relaxed text-muted">
        <p>
          Diese Seite ist der Title-ID-Finder, eine statische Website. Die Dateien liegen auf GitHub Pages. Ein
          eigenes Backend gibt es nicht.
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg">Keine Konten, keine Cookies, kein Tracking</h2>
        <p>Die Seite setzt keine Cookies. Es gibt keine Analyse, kein Werbenetz und kein Tracking.</p>
        <p>Es gibt keine Anmeldung und kein Benutzerkonto. Suchanfragen gehen nicht an einen Server dieses Projekts. Dieses Projekt speichert keine personenbezogenen Daten und gibt keine weiter.</p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg">Was im Browser bleibt</h2>
        <p>
          Der Suchtext kann in der Adresszeile dieses Tabs stehen (<span className="font-mono text-fg">?q=</span>). Das
          ist der Verlauf dieses Browsers, keine Kopie bei uns.
        </p>
        <p>
          Erscheinungsbild und Sprache bleiben lokal im Browser (<span className="font-mono text-fg">localStorage</span>
          , Schlüssel <span className="font-mono text-fg">consolecheat-theme</span> und{" "}
          <span className="font-mono text-fg">consolecheat-lang</span>), damit die Wahl ein Neuladen übersteht. Diese
          Werte werden nicht hochgeladen.
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg">Schriften</h2>
        <p>
          Die Schriften Outfit und Source Sans 3 liegen auf demselben Host wie diese Seite. Beim Laden geht keine
          Anfrage an Google oder an einen anderen Dritten.
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg">Hosting</h2>
        <p>
          GitHub liefert die Dateien über GitHub Pages aus. GitHub kann als Host Verbindungsdaten verarbeiten,
          insbesondere die IP-Adresse, den Zeitpunkt und die aufgerufene Adresse. Dieses Projekt betreibt keinen
          eigenen Server und erhält diese Protokolle nicht.{" "}
          <a
            href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement"
            className="text-steel underline-offset-4 hover:underline"
          >
            Datenschutzerklärung von GitHub
          </a>
          .
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg">Title-Liste</h2>
        <p>
          Die Title-IDs stammen aus der MIT-Liste andshrew/PlayStation-Titles. Der Browser lädt die aufbereitete Datei
          von dieser Website, nicht von einem separaten Suchdienst.
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg">Verantwortliche Stelle</h2>
        <p>
          Name und Anschrift stehen im Impressum. Solange dort nur Platzhalter stehen, sind hier absichtlich keine
          echten Kontaktdaten eingetragen.
        </p>
      </div>
      <div lang="en" className="mt-10 flex flex-col gap-4 border-t border-line pt-8 text-base leading-relaxed text-muted">
        <p>This page is the Title-ID-Finder, a static website. The files are hosted on GitHub Pages. There is no separate backend.</p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg">No accounts, no cookies, no tracking</h2>
        <p>This site does not set cookies. There is no analytics, no ad network, and no tracking.</p>
        <p>There is no sign-in and no account. Search queries are not sent to a server run by this project. This project does not store personal data and does not pass any on.</p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg">What stays in the browser</h2>
        <p>
          The search text can sit in the address bar of this tab (<span className="font-mono text-fg">?q=</span>). That
          is this browser’s history, not a copy kept by us.
        </p>
        <p>
          Theme and language stay in the browser (<span className="font-mono text-fg">localStorage</span>, keys{" "}
          <span className="font-mono text-fg">consolecheat-theme</span> and{" "}
          <span className="font-mono text-fg">consolecheat-lang</span>) so the choice survives a reload. Those values
          are not uploaded.
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg">Fonts</h2>
        <p>Outfit and Source Sans 3 are served from the same host as this page. Loading the page does not contact Google or any other third party.</p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg">Hosting</h2>
        <p>
          GitHub serves the files through GitHub Pages. As the host, GitHub can process connection data, in particular
          the IP address, the time, and the requested address. This project does not run its own server and does not
          receive those logs.{" "}
          <a
            href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement"
            className="text-steel underline-offset-4 hover:underline"
          >
            GitHub Privacy Statement
          </a>
          .
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg">Title list</h2>
        <p>The title IDs come from the MIT-licensed andshrew/PlayStation-Titles list. The browser loads the prepared file from this website, not from a separate search service.</p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-fg">Who is responsible</h2>
        <p>The name and address belong in the Impressum. While that page only has placeholders, no real contact details are published here on purpose.</p>
      </div>
    </article>
  );
}
