#ifndef AppVersion
  #define AppVersion "0.10.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\release\installer-stage"
#endif
#ifndef OutputDir
  #define OutputDir "..\release"
#endif

[Setup]
AppId={{AE2B4FD5-A21B-45AA-9DD2-97B5D2C8104B}
AppName=SmartLecture
AppVersion={#AppVersion}
AppPublisher=SmartLecture
DefaultDirName={localappdata}\Programs\SmartLecture
DefaultGroupName=SmartLecture
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=SmartLecture-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=SmartLecture
CloseApplications=no

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autodesktop}\SmartLecture"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\start-smartlecture.ps1"""; WorkingDir: "{app}"; Comment: "Mo SmartLecture"
Name: "{group}\SmartLecture"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\start-smartlecture.ps1"""; WorkingDir: "{app}"; Comment: "Mo SmartLecture"
Name: "{group}\Huong dan cai dat"; Filename: "{app}\HUONG-DAN-CAI-DAT.md"
Name: "{group}\Go cai dat SmartLecture"; Filename: "{uninstallexe}"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\start-smartlecture.ps1"""; WorkingDir: "{app}"; Description: "Mo SmartLecture"; Flags: nowait postinstall skipifsilent
