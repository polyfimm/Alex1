@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  [PC]     http://localhost:8080/index.html
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R /C:"IPv4"') do for /f "tokens=* delims= " %%b in ("%%a") do echo  [Phone]  http://%%b:8080/index.html   (same Wi-Fi only)
echo.
echo  Close this window to stop the server.
echo.
start "" http://localhost:8080/index.html
python -m http.server 8080 --bind 0.0.0.0
