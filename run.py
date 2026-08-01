import os
import sys
import subprocess
import webbrowser
import time

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    venv_python = os.path.join(base_dir, ".venv", "Scripts", "python.exe")
    
    # Fallback if venv python not found
    python_exe = venv_python if os.path.exists(venv_python) else sys.executable
    
    print(f"[*] Launching Mini ChatGPT backend using: {python_exe}")
    
    # Check if dependencies are installed
    try:
        subprocess.run([python_exe, "-c", "import fastapi, uvicorn, google.genai"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        print("[*] Installing required dependencies from requirements.txt...")
        req_file = os.path.join(base_dir, "requirements.txt")
        subprocess.run([python_exe, "-m", "pip", "install", "-r", req_file], check=True)

    print("[*] Starting server on http://127.0.0.1:8000 ...")
    
    # Open browser automatically after 1.5 seconds
    def open_browser():
        time.sleep(1.5)
        webbrowser.open("http://127.0.0.1:8000")
        
    import threading
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Run Uvicorn app
    cmd = [python_exe, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8000", "--reload"]
    subprocess.run(cmd, cwd=base_dir)

if __name__ == "__main__":
    main()
