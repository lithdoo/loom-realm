@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "EXAMPLE=%cd%"
for %%I in ("%EXAMPLE%\..\..") do set "REPO=%%~fI"

if not defined HOSTRA_SOURCE_DIR if exist "%REPO%\.qualification\hostra\packages\hostra\scripts\hostra.js" set "HOSTRA_SOURCE_DIR=%REPO%\.qualification\hostra"
if not defined HOSTRA_SOURCE_DIR if exist "%REPO%\..\hostra\packages\hostra\scripts\hostra.js" set "HOSTRA_SOURCE_DIR=%REPO%\..\hostra"

if not defined HOSTRA_SOURCE_DIR (
  echo 找不到冻结 Hostra。请设置 HOSTRA_SOURCE_DIR，或把 lithdoo/hostra 放在仓库旁的 ..\hostra。
  pause
  exit /b 1
)

set "HOSTRA_JS=%HOSTRA_SOURCE_DIR%\packages\hostra\scripts\hostra.js"
set "ELECTRON_EXE=%HOSTRA_SOURCE_DIR%\packages\hostra\electron_bin\electron.exe"
set "DESKTOP_ENTRY=%REPO%\apps\desktop\dist\main-entry.js"

if not exist "%HOSTRA_JS%" (
  echo 无效的 Hostra 源：%HOSTRA_JS%
  pause
  exit /b 1
)
if not exist "%ELECTRON_EXE%" (
  echo Hostra 还没有 Electron 运行时。请在该目录执行 npm ci：
  echo   %HOSTRA_SOURCE_DIR%
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo 找不到 Node.js。请先安装 Node 20+ 并加入 PATH。
  pause
  exit /b 1
)
for /f "delims=" %%I in ('where node') do (
  set "NODE=%%I"
  goto :got_node
)
:got_node

if not exist "%REPO%\node_modules\" (
  echo 正在安装 LoomRealm 依赖...
  pushd "%REPO%"
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    popd
    echo npm ci 失败。
    pause
    exit /b 1
  )
  popd
)

if not exist "%DESKTOP_ENTRY%" (
  echo 正在构建 Desktop / Map...
  pushd "%REPO%"
  call npm run build:m15
  if errorlevel 1 (
    popd
    echo npm run build:m15 失败。
    pause
    exit /b 1
  )
  popd
)

set "HOSTRA_RPC_PORT=0"
set "HOSTRA_RPC_TOKEN=loomrealm-essentials-%RANDOM%%RANDOM%"
set "HOSTRA_CONFIG_DIR=%REPO%"
set "HOSTRA_USER_DATA_DIR=%TEMP%\loomrealm-essentials-v21.1-hostra"
set HOSTRA_SUBCMD="%NODE%" "%DESKTOP_ENTRY%"
set "LOOMREALM_DESKTOP_INSTALLATION_ROOT=%EXAMPLE%"
set "HOSTRA_APP_NAME=LoomRealm Essentials v21.1"
set ELECTRON_RUN_AS_NODE=

echo 启动 Hostra 游戏窗口...
echo   游戏: %EXAMPLE%
echo   Hostra: %HOSTRA_SOURCE_DIR%
pushd "%REPO%"
"%NODE%" "%HOSTRA_JS%"
set "CODE=%ERRORLEVEL%"
popd
if not "%CODE%"=="0" (
  echo Hostra 退出码 %CODE%。
  pause
)
exit /b %CODE%
