@echo off
setlocal enabledelayedexpansion

title VRChat Plex Status - Setup
color 0B

echo.
echo  ============================================================
echo             VRChat Plex Status - Setup Wizard
echo  ============================================================
echo.

:: Get the current directory (remove trailing backslash)
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

echo  Current folder: %SCRIPT_DIR%
echo.

:: ============================================
:: Step 1: Node.js Check
:: ============================================

echo  ------------------------------------------------------------
echo   Step 1: Node.js
echo  ------------------------------------------------------------
echo.

where node >nul 2>nul
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo  [OK] Node.js !NODE_VERSION! detected
) else (
    echo  [!!] Node.js is not installed.
    echo.
    echo  Would you like to install Node.js automatically?
    echo.
    set /p "INSTALL_NODE=  Install Node.js? (Y/n): "
    if "!INSTALL_NODE!"=="" set "INSTALL_NODE=y"

    if /i "!INSTALL_NODE!"=="y" (
        echo.
        echo  Installing Node.js via winget...
        echo.
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        if !errorlevel! neq 0 (
            echo.
            echo  [XX] Failed. Please install from https://nodejs.org/
            echo.
            pause
            exit /b 1
        )
        echo.
        echo  [OK] Node.js installed!
        echo.
        echo  [!!] Please close this window and run Setup.cmd again.
        echo.
        pause
        exit /b 0
    ) else (
        echo.
        echo  [XX] Node.js is required.
        echo.
        pause
        exit /b 1
    )
)

:: ============================================
:: Step 2: Install npm dependencies
:: ============================================

echo.
echo  ------------------------------------------------------------
echo   Step 2: Dependencies
echo  ------------------------------------------------------------
echo.

cd /d "%SCRIPT_DIR%"

if exist "node_modules" (
    echo  [OK] Dependencies installed
) else (
    echo  Installing npm packages...
    echo.
    call npm install
    if !errorlevel! neq 0 (
        echo.
        echo  [XX] Failed to install dependencies.
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Dependencies installed
)

:: ============================================
:: Step 3: Create shortcut in project folder
:: ============================================

echo.
echo  ------------------------------------------------------------
echo   Step 3: Creating Launcher
echo  ------------------------------------------------------------
echo.

set "SHORTCUT_NAME=VRChatPlexStatus.lnk"
set "SHORTCUT_PATH=%SCRIPT_DIR%\%SHORTCUT_NAME%"

:: Create .lnk shortcut using PowerShell
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'node'; $s.Arguments = 'index.js'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Description = 'VRChat Plex Status'; $s.Save()"

if exist "%SHORTCUT_PATH%" (
    echo  [OK] Created %SHORTCUT_NAME%
) else (
    echo  [XX] Failed to create shortcut
)

:: ============================================
:: Step 4: VRCX Auto-startup
:: ============================================

echo.
echo  ------------------------------------------------------------
echo   Step 4: VRCX Auto-startup
echo  ------------------------------------------------------------
echo.

set "VRCX_STARTUP=%APPDATA%\VRCX\Startup"

if exist "%APPDATA%\VRCX" (
    echo  [OK] VRCX detected
    echo.
    set /p "ADD_VRCX=  Add to VRCX startup? (Y/n): "
    if "!ADD_VRCX!"=="" set "ADD_VRCX=y"

    if /i "!ADD_VRCX!"=="y" (
        if not exist "%VRCX_STARTUP%" mkdir "%VRCX_STARTUP%"
        copy /y "%SHORTCUT_PATH%" "%VRCX_STARTUP%\%SHORTCUT_NAME%" >nul
        echo.
        echo  [OK] Added to VRCX startup
    )
) else (
    echo  [--] VRCX not detected, skipping
)

:: ============================================
:: Step 5: First-time setup
:: ============================================

echo.
echo  ------------------------------------------------------------
echo   Step 5: Configuration
echo  ------------------------------------------------------------
echo.

echo  Run the app now to set up Plex and VRChat?
echo.
set /p "RUN_NOW=  Run now? (Y/n): "
if "!RUN_NOW!"=="" set "RUN_NOW=y"

if /i "!RUN_NOW!"=="y" (
    echo.
    cd /d "%SCRIPT_DIR%"
    node index.js
)

:: ============================================
:: Done
:: ============================================

echo.
echo  ============================================================
echo   Setup Complete!
echo  ============================================================
echo.

pause
