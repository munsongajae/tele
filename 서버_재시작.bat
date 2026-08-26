@echo off
chcp 65001 > nul
title 텔레그램 서버 관리 도구

echo ===================================================
echo   텔레그램 서버 재시작 및 초기화 도구
echo ===================================================
echo.
echo 1. 기존에 실행 중인 텔레그램 서버 프로세스들을 안전하게 종료합니다...
taskkill /f /im python.exe 2>nul
taskkill /f /im app.exe 2>nul
timeout /t 2 > nul

echo.
echo 2. 텔레그램 서버를 다시 실행합니다...
if exist dist\app.exe (
    start "" "dist\app.exe"
) else (
    start "" python app.py
)

echo.
echo ===================================================
echo   서버 재시작이 완료되었습니다!
echo   인터넷 브라우저에서 아래 주소로 접속해 주세요.
echo.
echo   http://127.0.0.1:8788
echo ===================================================
echo.
pause
