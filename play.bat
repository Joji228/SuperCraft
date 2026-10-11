@echo off
rem Double-click to play SuperCraft locally: starts a small web server and opens the game.
rem Close this window to stop the server.
cd /d "%~dp0"
start "" http://localhost:8080
python tools\serve.py 8080
