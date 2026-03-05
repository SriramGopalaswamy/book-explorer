@echo off
echo ========================================
echo  GRX10 Books - Full Stack Startup
echo ========================================
echo.

echo [1/2] Starting Backend API Server...
start "Backend API" cmd /k "cd backend-api && npm start"
timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend...
start "Frontend" cmd /k "npm run dev"
timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo  Application Started Successfully!
echo ========================================
echo.
echo  Backend API:  http://localhost:3001
echo  Frontend:     http://localhost:8080
echo.
echo  Login Credentials:
echo  Email:    admin@grx10.com
echo  Password: admin123
echo ========================================
echo.
pause
