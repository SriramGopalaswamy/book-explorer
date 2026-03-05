@echo off
echo ========================================
echo Setting up Financial Verification Function
echo ========================================
echo.

cd /d "%~dp0\.."

echo Running setup script...
node scripts\setup-verification.js

echo.
echo Press any key to exit...
pause > nul
