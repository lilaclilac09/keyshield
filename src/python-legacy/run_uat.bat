@echo off
REM run_uat.bat — Run User Acceptance Tests for KeyShield v2-MVP
REM This is the master validation script.
REM If UAT passes, everything works end-to-end.

setlocal

cd /d "%~dp0"

set SERVER_SECRET=CHANGE-ME-IN-PROD-32-BYTES-MIN
set KS_INTERNAL_SECRET=test-secret-key

echo Running KeyShield v2-MVP UAT (User Acceptance Tests)...
echo.

python -m tests.uat --quiet
set UAT_RESULT=%errorlevel%

echo.
if %UAT_RESULT%==0 (
    echo ✓ All UAT tests passed — system is healthy!
) else (
    echo ✗ UAT tests FAILED — review the output above.
    echo Exit code: %UAT_RESULT%
)

exit /b %UAT_RESULT%
