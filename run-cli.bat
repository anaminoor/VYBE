@echo off
rem Double-click to start VYBE in the terminal (playlists only, no sound)
cd /d "%~dp0"
java --enable-native-access=ALL-UNNAMED -cp "lib\*" java\Main.java cli
pause
