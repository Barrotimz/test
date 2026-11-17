@echo off
setlocal
cd /d "%~dp0"

where pyw >nul 2>&1
if %errorlevel%==0 (
  pyw -3 "%~dp0internet_switch.py" %*
  if not errorlevel 1 exit /b 0
)

where pythonw >nul 2>&1
if %errorlevel%==0 (
  pythonw "%~dp0internet_switch.py" %*
  if not errorlevel 1 exit /b 0
)

where py >nul 2>&1
if %errorlevel%==0 (
  py -3 "%~dp0internet_switch.py" %*
  exit /b %errorlevel%
)

where python >nul 2>&1
if %errorlevel%==0 (
  python "%~dp0internet_switch.py" %*
  exit /b %errorlevel%
)

echo Install Python from https://www.python.org/downloads/
echo Check "Add python.exe to PATH", then double-click this file again.
pause
exit /b 1
