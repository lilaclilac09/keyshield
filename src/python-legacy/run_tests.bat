@echo off
REM run_tests.bat — Run all KeyShield tests with pytest
REM Usage: run_tests.bat [verbose] [coverage]
REM Example: run_tests.bat verbose coverage

setlocal

REM Navigate to v2-mvp directory if needed
if exist "tests\uat.py" (
    cd /d "%~dp0"
) else (
    cd /d "%~dp0..%~dp0\v2-mvp" 2>nul || cd /d "%~dp0v2-mvp"
)

REM Set up test environment
set SERVER_SECRET=CHANGE-ME-IN-PROD-32-BYTES-MIN
set KS_INTERNAL_SECRET=test-secret-key
set KS_X402_BASE_RPC_URL=https://mainnet.base.org
set KS_X402_RECEIVER_ADDRESS=0x1234567890abcdef1234567890abcdef12345678

REM Check if pytest is installed
python -m pytest --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing pytest...
    pip install -q pytest pytest-asyncio
)

REM Build pytest flags
set PYTEST_FLAGS=--tb=short
if /i "%~1"=="verbose" set PYTEST_FLAGS=--tb=long -v
if /i "%~2"=="coverage" (
    pip install -q pytest-cov >nul 2>&1
    set PYTEST_FLAGS=%PYTEST_FLAGS% --cov=src --cov-report=term-missing --cov-report=html:coverage
)

echo.
echo Running KeyShield v2-MVP tests...
echo.
python -m pytest %PYTEST_FLAGS% tests/
set TEST_RESULT=%errorlevel%

echo.
if /i "%~2"=="coverage" (
    echo Coverage report saved to coverage/index.html
)

exit /b %TEST_RESULT%
