@echo off
rem Guarda a chave de um servico de verificacao de e-mail neste PC (arquivo chaves-email.txt). A chave nao vai para repositorio nem para o chat.
cd /d "%~dp0"
echo.
echo Servicos aceitos:  1 = Reoon   2 = QuickEmailVerification   3 = Emailable
echo A ordem em que voce cadastra e a ordem de uso: o primeiro e usado ate acabar a cota, depois o proximo.
echo.
set /p ESC=Numero do servico:
set SERV=
if "%ESC%"=="1" set SERV=reoon
if "%ESC%"=="2" set SERV=quickemailverification
if "%ESC%"=="3" set SERV=emailable
if "%SERV%"=="" (
  echo Opcao invalida. Nada foi salvo.
  pause
  exit /b 1
)
set /p CHAVE=Cole a chave e aperte Enter:
if "%CHAVE%"=="" (
  echo Nenhuma chave informada. Nada foi salvo.
  pause
  exit /b 1
)
>>chaves-email.txt (echo %SERV%=%CHAVE%)
echo.
echo Chave de %SERV% salva em chaves-email.txt (so neste PC). Feche o Prospecta e abra de novo pelo atalho.
echo Para trocar a ordem ou remover um servico, abra chaves-email.txt no Bloco de Notas.
pause
