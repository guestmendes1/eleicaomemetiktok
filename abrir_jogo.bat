@echo off
title Abrindo Jogo Interativo TikTok
echo Abrindo o jogo em janela dedicada para captura...

:: Tenta abrir no Chrome em modo app (janela limpa vertical sem abas)
start chrome --app="http://127.0.0.1:3000" --window-size=500,890 2>nul
if %errorlevel% neq 0 (
    :: Se nao tiver Chrome, abre no Edge em modo app
    start msedge --app="http://127.0.0.1:3000" --window-size=500,890
)

echo.
echo Janela aberta!
echo No TikTok Live Studio:
echo 1. Clique em 'Adicionar Fonte'
echo 2. Escolha 'Captura de Janela'
echo 3. Selecione a janela do jogo (Batalha Interativa 13 vs 22)!
