@echo off
:: Start ComfyUI using venv Python directly
start "ComfyUI" cmd /k "cd /d C:\Users\ADMIN\Desktop\AI\ComfyUI && C:\Users\ADMIN\Desktop\AI\ComfyUI\venv\Scripts\python.exe main.py"
:: Start Backend
start "Backend" cmd /k "cd /d C:\Users\ADMIN\Desktop\custom holiday\backend && python -m uvicorn app:app --reload"
:: Start n8n
start "n8n" cmd /k "n8n"
:: Start PDF Service
start "PDF Service" cmd /k "cd /d C:\Users\ADMIN\Desktop\PDF Service && node server.js"
exit