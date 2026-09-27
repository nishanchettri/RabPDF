@echo off
setlocal
cd /d "%~dp0.."

if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv
  if errorlevel 1 exit /b 1
)

.venv\Scripts\python -m pip install --upgrade pip
if errorlevel 1 exit /b 1
.venv\Scripts\python -m pip install -r requirements.txt -r requirements-build.txt
if errorlevel 1 exit /b 1
.venv\Scripts\python -m unittest discover -s tests -v
if errorlevel 1 exit /b 1
.venv\Scripts\pyinstaller --noconfirm --clean RabPDF.spec
if errorlevel 1 exit /b 1

echo.
echo Build complete: dist\RabPDF.exe
pause
