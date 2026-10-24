@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0."

echo ====================================================
echo   销售记录系统  +  Cloudflare 公网隧道（免账号/免注册）
echo ====================================================
echo [1/2] 启动销售系统服务 (http://127.0.0.1:3000)
start "" cmd /k "start.bat"

echo 等待服务启动...
timeout /t 5 >nul

echo [2/2] 建立公网隧道（Cloudflare quick tunnel）
echo.
echo 稍等几秒，下方会出现一个 https://xxxx.trycloudflare.com 的公网地址。
echo 把这个地址发给同事 / 手机，即可在外网打开本系统。
echo 注意：此地址每次启动都会变；关闭本窗口即断开隧道。
echo 注意：公网可访问，请务必先把管理员口令改为强口令（不要用 admin1）。
echo 如需常开，请保持本窗口一直运行（或加入开机自启）。
echo ====================================================
echo 本机网络对 Cloudflare 的 QUIC 不稳定，这里固定走 HTTP/2，启动更可靠。
cloudflared.exe tunnel --url http://127.0.0.1:3000 --protocol http2 --no-autoupdate
pause
