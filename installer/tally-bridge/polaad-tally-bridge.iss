#define AppName "Polaad Tally Connector"
#define AppVersion "0.1.54"
#define AppPublisher "Polaad"
#define AppInstallDir "C:\Polaad\tally-bridge"
#define AppExeName "Polaad Tally Connector.exe"
#define TdlFileName "polaad-native-debit-note-export.tdl"

[Setup]
AppId={{9A6F0ED7-1C44-4DC2-A8E5-4CC9F00C1571}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
UninstallDisplayName={#AppName}
DefaultDirName={#AppInstallDir}
DisableProgramGroupPage=yes
DisableWelcomePage=no
DisableReadyPage=no
OutputDir=output
UsePreviousAppDir=no
OutputBaseFilename=PolaadTallyConnectorSetup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
Uninstallable=yes
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
VersionInfoCompany={#AppPublisher}
VersionInfoDescription={#AppName} Setup
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[InstallDelete]
Type: filesandordirs; Name: "{app}\*"
Type: filesandordirs; Name: "{localappdata}\Programs\Polaad Tally Connector\*"

[Files]
Source: "payload-clean\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
Root: HKCU; Subkey: "Software\Classes\polaad-tally"; ValueType: string; ValueName: ""; ValueData: "URL:Polaad Tally Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\polaad-tally"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\polaad-tally\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#AppExeName},0"
Root: HKCU; Subkey: "Software\Classes\polaad-tally\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" ""%1"""

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{cmd}'), '/C taskkill /F /IM "Polaad Tally Connector.exe" >nul 2>&1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  TallyDir: String;
  SourceTdl: String;
  TargetTdl: String;
begin
  if CurStep = ssPostInstall then
  begin
    TallyDir := ExpandConstant('{pf}\TallyPrime');
    SourceTdl := ExpandConstant('{app}\tdl\{#TdlFileName}');
    TargetTdl := TallyDir + '\{#TdlFileName}';
    if DirExists(TallyDir) and FileExists(SourceTdl) then
    begin
      if CopyFile(SourceTdl, TargetTdl, False) then
        Log('Copied TDL to ' + TargetTdl)
      else
        Log('Could not copy TDL to ' + TargetTdl + '; canonical copy remains at ' + SourceTdl);
    end;
  end;
end;
