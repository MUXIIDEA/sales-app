@echo off
cd /d "%~dp0."
echo ====================================================
echo   销售记录系统  +  localtunnel 公网隧道（免账号/免下载）
echo ====================================================
echo [1/2] 启动销售系统服务 (http://localhost:3000)
start "" cmd /k "start.bat"
echo 等待服务启动...
timeout /t 5 >nul
echo [2/2] 建立公网隧道（localtunnel，首次会自动联网安装）
echo.
echo 稍等几秒，下方会出现一个 https://xxxx.loca.lt 的公网地址。
echo 把这个地址发给同事 / 手机，即可在外网打开本系统。
echo 注意：此地址每次启动都会变；关闭本窗口即断开隧道。
echo ====================================================
npx localtunnel --port 3000
pause
