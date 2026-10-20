@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0."
set "NODE_EXE="
set "V="

if exist "C:\nodejs\node.exe" (
  for /f "usebackq tokens=*" %%V in (`"C:\nodejs\node.exe" -v`) do set "V=%%V"
  if defined V (
    set "CHECK=!V:v22=!"
    if not "!CHECK!"=="!V!" set "NODE_EXE=C:\nodejs\node.exe"
  )
  set "V="
)

if not defined NODE_EXE (
  for /d %%D in ("C:\Users\MUXI\.workbuddy\binaries\node\versions\*") do (
    if exist "%%D\node.exe" (
      for /f "usebackq tokens=*" %%V in (`"%%D\node.exe" -v`) do set "V=%%V"
      if defined V (
        set "CHECK=!V:v22=!"
        if not "!CHECK!"=="!V!" set "NODE_EXE=%%D\node.exe"
      )
      set "V="
    )
  )
)

if not defined NODE_EXE (
  for /f "usebackq tokens=*" %%V in (`node -v`) do set "V=%%V"
  if defined V (
    set "CHECK=!V:v22=!"
    if not "!CHECK!"=="!V!" set "NODE_EXE=node"
  )
  set "V="
)

if not defined NODE_EXE (
  echo ====================================================
  echo   No compatible Node.js 22 found
  echo   The bundled better-sqlite3 driver requires Node 22 LTS
  echo   Option 1: install Node 22 LTS to C:\nodejs\node.exe
  echo   Option 2: run command  npm rebuild better-sqlite3
  echo ====================================================
  pause
  exit /b 1
)

for /f "usebackq tokens=*" %%V in (`"%NODE_EXE%" -v`) do set "VER=%%V"
echo Using Node: %NODE_EXE%  version %VER%
echo Starting Sales Record System
echo Local:   http://localhost:3000
echo LAN:     http://YOUR_LAN_IP:3000
echo Press Ctrl+C to stop the server
"%NODE_EXE%" server.js
pause
