# Polad Tally Connector Installer

This folder contains the Windows installer assets for the Polad desktop Tally connector.

The installer:

- uses the visible product name `Polad Tally Connector`
- installs under `C:\Polad\tally-bridge`
- preserves the existing `%USERPROFILE%\.polaad-tally-bridge\config.json` pairing during updates
- registers the `polaad-tally://` protocol expected by the Polad web application
- starts the connector after installation
- includes the Polad native Tally Debit Note PDF TDL
- uses its own executable, protocol, setup filename, application ID, configuration folder, and installation directory

## Build on Windows

Provide a Windows Electron runtime directory. It may contain `Polad Tally Connector.exe`,
`electron.exe`, or one other Electron runtime `.exe`:

```powershell
$env:POLAD_CONNECTOR_RUNTIME = "C:\path\to\electron-runtime"
npm run installer:tally-bridge
```

You can also run `installer\tally-bridge\build.cmd` from Windows.

The setup executable is written to:

```text
installer\tally-bridge\output\PoladTallyConnectorSetup.exe
```

## Runtime layout

```text
C:\Polad\tally-bridge
C:\Polad\tally-bridge\resources\app
%USERPROFILE%\.polaad-tally-bridge\config.json
```

The generated payload excludes old logs, archives, and stale Electron `app.asar`
files. The current wrapper and `apps/tally-bridge/src/bridge.mjs` are inserted into
the clean runtime during every build.

## User flow

1. Run `PoladTallyConnectorSetup.exe`.
2. Open Polad and click **Connect** on the Tally page.
3. Allow the browser to open the `polaad-tally://` link.
4. Keep `Polad Tally Connector` open while using Tally Prime.

The connector displays `Connected to <company name>` after pairing when Tally Prime
is reachable and a company is loaded.

### One-time native PDF activation

The canonical TDL is installed at:

```text
C:\Polad\tally-bridge\tdl\polaad-native-debit-note-export.tdl
```

The setup also attempts to copy it into the TallyPrime installation folder. In
TallyPrime, select it once in `F1: Help > TDL & Add-On`, enable **Load selected TDL
files on startup**, and restart TallyPrime.
