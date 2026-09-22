@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "EXAMPLE=%cd%"
for %%I in ("%EXAMPLE%\..\..") do set "REPO=%%~fI"

set "YES="
set "SOURCE="
if /I "%~1"=="/Y" set "YES=1" & shift
if /I "%~1"=="--yes" set "YES=1" & shift
if /I "%~1"=="--source" goto :source_flag
if not "%~1"=="" set "SOURCE=%~1"
goto :source_done

:source_flag
if "%~2"=="" (
  echo 缺少 --source 路径。
  pause
  exit /b 1
)
set "SOURCE=%~2"
:source_done
if not defined SOURCE if defined ESSENTIALS_V21_1_SOURCE set "SOURCE=%ESSENTIALS_V21_1_SOURCE%"

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

echo 将删除本目录下现有 [FSDB]*，并用当前 importer 重新生成。
echo 候选库会先在 .local staging 中验证 Map.behaviors、Tileset terrain_tags 与 Presentation，再安全替换正式库。
if defined SOURCE goto :echo_source
echo 未指定源：将尝试官方下载。被拦截时会打开本机浏览器。
echo 也可传入本机 Essentials v21.1 目录或 zip：
echo   reimport.bat "C:\path\to\Pokemon Essentials v21.1"
echo   reimport.bat "C:\path\to\Pokemon_Essentials_v21.1.zip"
echo 或设置 ESSENTIALS_V21_1_SOURCE。
goto :confirm
:echo_source
echo 源: %SOURCE%

:confirm
echo.
if defined YES goto :run_import
set /p "CONFIRM=输入 Y 继续："
if /I "%CONFIRM%"=="Y" goto :run_import
echo 已取消。
exit /b 1

:run_import
echo 正在重导入 FSDB...
if defined SOURCE goto :import_with_source
"%NODE%" "%EXAMPLE%\scripts\init-fsdb.mjs" --force
goto :import_done

:import_with_source
"%NODE%" "%EXAMPLE%\scripts\init-fsdb.mjs" --force --source "%SOURCE%"

:import_done
if errorlevel 1 (
  echo 重导入失败。
  pause
  exit /b 1
)

"%NODE%" "%EXAMPLE%\scripts\verify-reimport.mjs" "%EXAMPLE%"
if errorlevel 1 (
  echo 重导入验证失败；原正式库已保留或恢复。
  pause
  exit /b 1
)

echo 下一步：play.bat
exit /b 0
