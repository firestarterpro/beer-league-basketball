@echo off
title Sync Server (Close browser tab to stop)
cd /d "C:\Templar Archives\Basketball Bro\beer-league\sync"
start http://127.0.0.1:8080
.\.venv\Scripts\python.exe sync_console_server.py