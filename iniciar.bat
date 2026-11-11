@echo off
rem Liga o motor (se o Docker estiver ativo), o tunel do verificador de e-mail (se configurado) e abre o Prospecta no navegador.
cd /d "%~dp0"
where docker >nul 2>&1 && docker info >nul 2>&1 && docker compose up -d
if exist verificador-remoto.txt for /f "usebackq skip=2 delims=" %%s in ("verificador-remoto.txt") do start "tunel-verificador" /min ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o BatchMode=yes -L 8790:127.0.0.1:8790 %%s
node iniciar-prospecta.js
pause
