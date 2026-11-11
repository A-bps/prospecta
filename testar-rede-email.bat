@echo off
rem Mostra o que esta internet permite para validar e-mails. Rode em cada rede (casa, 4G do celular) e compare.
cd /d "%~dp0"
node testar-rede-email.js
pause
