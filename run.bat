@echo off
rem Double-click to start VYBE, then open http://localhost:8080
cd /d "%~dp0"
start "" http://localhost:8080
java --enable-native-access=ALL-UNNAMED -cp "lib\*" java\Main.java
pause
