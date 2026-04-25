@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo     FREIGHTER PLANNER - ONE CLICK SETUP ^& START
echo ===================================================
echo.

:: 1. Check Prerequisites
echo [1/4] Checking prerequisites...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed! Please install it from https://nodejs.org
    pause
    exit /b
)

where psql >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] PostgreSQL is not installed or not in your system PATH!
    echo Please install PostgreSQL from https://www.postgresql.org/download/windows/
    echo Make sure to install the Command Line Tools.
    pause
    exit /b
)
echo - Prerequisites found!
echo.

:: 2. Database Configuration
echo [2/4] Database Configuration...
set /p DB_PASS="Enter your PostgreSQL password (the one you created during installation): "

:: Generate backend/.env file with the user's local password
echo DB_HOST=localhost> ".\backend\.env"
echo DB_PORT=5432>> ".\backend\.env"
echo DB_NAME=freighter_planner>> ".\backend\.env"
echo DB_USER=postgres>> ".\backend\.env"
echo DB_PASSWORD=!DB_PASS!>> ".\backend\.env"
echo JWT_SECRET=local_secure_secret_key_123>> ".\backend\.env"
echo JWT_EXPIRES_IN=7d>> ".\backend\.env"
echo PORT=3001>> ".\backend\.env"
echo NODE_ENV=development>> ".\backend\.env"
echo CORS_ORIGIN=http://localhost:3000>> ".\backend\.env"

:: Inject Seed Data
echo - Setting up database tables and master data...
set PGPASSWORD=!DB_PASS!
:: Check if DB exists, if not create it
psql -U postgres -c "SELECT 1 FROM pg_database WHERE datname = 'freighter_planner'" | find "1" >nul
if %ERRORLEVEL% neq 0 (
    psql -U postgres -c "CREATE DATABASE freighter_planner" >nul 2>nul
)
:: Populate the database from seed.sql
psql -U postgres -d freighter_planner -q -f ".\database\seed.sql" >nul 2>nul
echo.

:: 3. Initializing Node Packages
echo [3/4] Checking Node Packages...
if not exist ".\backend\node_modules\" (
    echo - Installing Backend Dependencies (this takes a minute)...
    cd backend
    call npm install >nul 2>nul
    cd ..
)
if not exist ".\frontend\node_modules\" (
    echo - Installing Frontend Dependencies (this takes a minute)...
    cd frontend
    call npm install >nul 2>nul
    cd ..
)
echo.

:: 4. Start the Application
echo [4/4] Starting Servers...
echo - Starting Backend Server...
start "Freighter Backend" cmd /c "cd backend && npm start"

echo - Starting Frontend ^(Browser will open automatically^)...
start "Freighter Frontend" cmd /c "cd frontend && npm start"

echo.
echo ===================================================
echo SYSTEM IS RUNNING!
echo You can close this window. Please leave the two 
echo terminal windows running in the background while 
echo you use the application.
echo ===================================================
timeout /t 5 >nul
