# P72 — Windows Installer Distribution Summary

Completed 2026-09-08.

- `npm run package:windows` creates a distributable `release/SmartLecture-Setup-<version>.exe`.
- The installer is per-user and supplies Desktop/Start Menu launchers without requiring Node.js, Git, a terminal, or GitHub access on the teacher's machine.
- App files live in `%LOCALAPPDATA%\Programs\SmartLecture`; classroom data lives in `%LOCALAPPDATA%\SmartLecture\data` and survives uninstall/update.
- Verified the staged build with bundled Node 24.12.0 and the `/api/health` contract on port 4184. The generated v0.9.2 installer is 81,333,988 bytes.
