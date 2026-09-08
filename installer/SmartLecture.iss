#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{BD9F49AD-2D69-4D62-83B1-77C9EB043B17}
AppName=SmartLecture
AppVersion={#AppVersion}
AppPublisher=SmartLecture
DefaultDirName={localappdata}\Programs\SmartLecture
DefaultGroupName=SmartLecture
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\release
OutputBaseFilename=SmartLecture-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=SmartLecture
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "..\release\staging\app\*"; DestDir: "{app}\app"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autodesktop}\SmartLecture"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\app\scripts\start-smartlecture.ps1"""; WorkingDir: "{app}\app"; IconFilename: "{sys}\shell32.dll"; IconIndex: 220
Name: "{group}\SmartLecture"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\app\scripts\start-smartlecture.ps1"""; WorkingDir: "{app}\app"; IconFilename: "{sys}\shell32.dll"; IconIndex: 220
Name: "{group}\Huong dan cai dat"; Filename: "{app}\app\docs\HUONG-DAN-CAI-DAT.md"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\app\scripts\start-smartlecture.ps1"""; WorkingDir: "{app}\app"; Description: "Mo SmartLecture"; Flags: nowait postinstall skipifsilent
