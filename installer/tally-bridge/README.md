# Polaad Tally Connector Installer

This folder contains the Windows installer assets for the Polaad desktop Tally connector.

The installer:

- uses the visible product name `Polaad Tally Connector`
- installs without elevation under `C:\Polaad\tally-bridge`
- preserves the existing `%USERPROFILE%\.polaad-tally-bridge\config.json` pairing during updates
- registers the `polaad-tally://` protocol expected by the Polaad web application
- starts the connector after installation
- includes the Polaad native Tally Debit Note PDF TDL
- uses its own executable, protocol, setup filename, application ID, configuration folder, and installation directory

## Build on Windows

Provide a Windows Electron runtime directory. It may contain `Polaad Tally Connector.exe`,
`electron.exe`, or one other Electron runtime `.exe`:

```powershell
$env:POLAAD_CONNECTOR_RUNTIME = "C:\path\to\electron-runtime"
npm run installer:tally-bridge
```

You can also run `installer\tally-bridge\build.cmd` from Windows.

The setup executable is written to:

```text
installer\tally-bridge\output\PolaadTallyConnectorSetup.exe
```

## Runtime layout

```text
C:\Polaad\tally-bridge
C:\Polaad\tally-bridge\resources\app
%USERPROFILE%\.polaad-tally-bridge\config.json
```

The generated payload excludes old logs, archives, and stale Electron `app.asar`
files. The current wrapper and `apps/tally-bridge/src/bridge.mjs` are inserted into
the clean runtime during every build.

## User flow

1. Run `PolaadTallyConnectorSetup.exe`.
2. Open Polaad and click **Connect** on the Tally page.
3. Allow the browser to open the `polaad-tally://` link.
4. Keep `Polaad Tally Connector` open while using Tally Prime.

The connector displays `Connected to <company name>` after pairing when Tally Prime
is reachable and a company is loaded.

## Local document parsing

The connector bundles Firecrawl AnyDoc and parses supported documents entirely on
the connector machine. Markdown is the default output. For PDFs, `--output json`
uses the same deterministic table normalization, account extraction, amount
reconciliation, provenance, and running-balance validation as the backend bank
statement worker. If AnyDoc loses a known bank's columns across pages, the
connector uses the backend's physical PDF-column reader before returning JSON.
Other document types return AnyDoc's structured document model.
Hosted OCR is disabled.

```powershell
npm run document:parse --workspace @polaad/tally-bridge -- --input "C:\path\invoice.pdf"
npm run document:parse --workspace @polaad/tally-bridge -- --input "C:\path\report.docx" --output json --out parsed.json
```

The paired bridge accepts a `parse_document` command with `documentUrl` (HTTPS) or
`base64`, an optional `fileName`/`format`, and `output: "markdown" | "json"`.
Documents are limited to 25 MB and are never sent to Firecrawl.

### One-time native PDF activation

The canonical TDL is installed at:

```text
C:\Polaad\tally-bridge\tdl\polaad-native-debit-note-export.tdl
```

The setup also attempts to copy it into the TallyPrime installation folder. In
TallyPrime, select it once in `F1: Help > TDL & Add-On`, enable **Load selected TDL
files on startup**, and restart TallyPrime.
