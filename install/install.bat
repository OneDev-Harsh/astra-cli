@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1

:: ============================================================
::  Astra CLI — Windows Installer
::  Installs "astrabot" from npm and exposes it as "astra"
::  Run as: install.bat
:: ============================================================

echo.
echo  ================================================
echo   Astra CLI  ^|  Windows Installer
echo  ================================================
echo.

:: ════════════════════════════════════════════════════════════
::  STEP 1 — Check for Node.js / npm
:: ════════════════════════════════════════════════════════════
where node >nul 2>&1
set "HAS_NODE=!errorlevel!"
where npm >nul 2>&1
set "HAS_NPM=!errorlevel!"

if !HAS_NODE! NEQ 0 (
    echo  [MISSING] Node.js is not installed.
    set /p "INST_NODE= Install Node.js now? This will open the official installer. [Y/n]: "
    if /i "!INST_NODE!"=="" set "INST_NODE=Y"
    if /i "!INST_NODE!"=="Y" (
        echo  [INFO] Downloading Node.js installer...
        powershell -NoProfile -ExecutionPolicy Bypass -Command ^
            "Invoke-WebRequest -Uri 'https://nodejs.org/dist/latest/node-v22.13.1-x64.msi' -OutFile '$env:TEMP\node-installer.msi'; Start-Process msiexec -ArgumentList '/i',$env:TEMP\node-installer.msi,'/qb' -Wait"
        if errorlevel 1 (
            echo  [ERROR] Node.js installation failed.
            echo          Install manually: https://nodejs.org
            goto :fail
        )
        :: Reload PATH
        for /f "tokens=*" %%i in ('powershell -NoProfile -Command ^
            "[System.Environment]::GetEnvironmentVariable(\"PATH\",\"Machine\") + \";\" + [System.Environment]::GetEnvironmentVariable(\"PATH\",\"User\")"') do set "PATH=%%i"
        where node >nul 2>&1
        if errorlevel 1 (
            echo  [WARN] Node.js was installed but a terminal restart is required.
            echo         Please close this window, open a new terminal, and re-run install.bat
            goto :fail
        )
        echo  [OK] Node.js installed.
    ) else (
        echo  [INFO] Skipped. Install Node.js from https://nodejs.org and re-run this script.
        goto :fail
    )
) else (
    for /f "tokens=*" %%v in ('node --version 2^>nul') do set "NODE_VER=%%v"
    echo  [OK] Node.js found: !NODE_VER!
)

:: ════════════════════════════════════════════════════════════
::  STEP 2 — Check for Bun (required runtime)
:: ════════════════════════════════════════════════════════════
where bun >nul 2>&1
if errorlevel 1 (
    echo  [MISSING] Bun is not installed.
    set /p "INST_BUN= Install Bun now? [Y/n]: "
    if /i "!INST_BUN!"=="" set "INST_BUN=Y"
    if /i "!INST_BUN!"=="Y" (
        echo  [INFO] Installing Bun...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
        if errorlevel 1 (
            echo  [ERROR] Bun installation failed.
            echo          Install manually: https://bun.sh/docs/installation
            goto :fail
        )
        for /f "tokens=*" %%i in ('powershell -NoProfile -Command ^
            "[System.Environment]::GetEnvironmentVariable(\"PATH\",\"User\")"') do set "PATH=%%i;%PATH%"
        where bun >nul 2>&1
        if errorlevel 1 (
            echo  [WARN] Bun was installed but a terminal restart is required.
            echo         Please close this window, open a new terminal, and re-run install.bat
            goto :fail
        )
        echo  [OK] Bun installed.
    ) else (
        echo  [INFO] Skipped. Install Bun from https://bun.sh and re-run this script.
        goto :fail
    )
) else (
    for /f "tokens=*" %%v in ('bun --version 2^>nul') do set "BUN_VER=%%v"
    echo  [OK] Bun found: !BUN_VER!
)

:: ════════════════════════════════════════════════════════════
::  STEP 3 — Install astrabot from npm globally
:: ════════════════════════════════════════════════════════════
echo.
echo  [INFO] Installing astrabot from npm...
echo         (this exposes the "astra" command globally)
echo.
call npm install -g astrabot
if errorlevel 1 (
    echo.
    echo  [ERROR] npm install failed.
    echo          Try running this script as Administrator, or check your network.
    goto :fail
)
echo.
echo  [OK] astrabot installed — "astra" command is now available.

:: ════════════════════════════════════════════════════════════
::  STEP 4 — Refresh PATH so the new "astra" bin is visible
:: ════════════════════════════════════════════════════════════
:: Pull the npm global bin dir and prepend it to PATH right now
for /f "tokens=*" %%p in ('npm config get prefix 2^>nul') do set "NPM_PREFIX=%%p"
set "PATH=!NPM_PREFIX!;!PATH!"

where astra >nul 2>&1
if errorlevel 1 (
    echo  [WARN] "astra" is not on PATH yet.
    echo         This is usually fixed by restarting your terminal.
    echo         npm global prefix: !NPM_PREFIX!
) else (
    echo  [OK] "astra" is on PATH.
)

:: ════════════════════════════════════════════════════════════
::  STEP 5 — Create config directory
:: ════════════════════════════════════════════════════════════
set "ASTRA_DIR=%USERPROFILE%\.astra"
if not exist "%ASTRA_DIR%" (
    mkdir "%ASTRA_DIR%"
    echo  [OK] Created config dir: %ASTRA_DIR%
) else (
    echo  [OK] Config dir exists: %ASTRA_DIR%
)

:: ════════════════════════════════════════════════════════════
::  DONE — Offer setup wizard
:: ════════════════════════════════════════════════════════════
echo.
echo  ================================================
echo   Installation complete!
echo  ================================================
echo.
echo   Package  : astrabot (npm)
echo   Command  : astra
echo   Config   : %ASTRA_DIR%\.env
echo.

echo  Run "astra setup" to configure your API keys.
echo  Then start Astra with:  astra wakeup
echo.
goto :done

:fail
echo.
echo  [FAIL] Installation did not complete. Review the errors above.
echo.
endlocal
exit /b 1

:done
endlocal
exit /b 0