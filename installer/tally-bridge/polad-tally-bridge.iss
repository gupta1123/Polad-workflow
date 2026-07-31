#define AppName "Polad Tally Connector"
#define AppVersion "0.1.0"
#define AppPublisher "Polad"
#define AppInstallDir "C:\Polad\tally-bridge"

[Setup]
AppId={{9A6F0ED7-1C44-4DC2-A8E5-4CC9F00C1571}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={#AppInstallDir}
DisableProgramGroupPage=yes
OutputDir=output
UsePreviousAppDir=no
OutputBaseFilename=PoladTallyConnectorSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Uninstallable=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "payload-clean\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
Root: HKCU; Subkey: "Software\Classes\polaad-tally"; ValueType: string; ValueName: ""; ValueData: "URL:Polad Tally Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\polaad-tally"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\polaad-tally\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\Polad Tally Connector.exe,0"
Root: HKCU; Subkey: "Software\Classes\polaad-tally\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Polad Tally Connector.exe"" ""%1"""
