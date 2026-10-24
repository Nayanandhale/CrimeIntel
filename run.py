"""
CrimeIntel - Root Launcher Script
Can be run simply with:
    py run.py
or:
    python run.py
"""
import sys
import os
import webbrowser
import threading
import time
from pathlib import Path

# Add backend to sys.path
BASE_DIR = Path(__file__).parent.resolve()
BACKEND_DIR = BASE_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(str(BACKEND_DIR))

# Ensure UTF-8 output on Windows
os.environ["PYTHONIOENCODING"] = "utf-8"

def open_browser():
    time.sleep(1.5)
    url = "http://127.0.0.1:8000"
    print(f"\n[OK] Opening CrimeIntel Investigation Console at {url} ...\n")
    try:
        webbrowser.open(url)
    except Exception:
        pass

if __name__ == "__main__":
    print("=" * 70)
    print(" CRIMEINTEL // AI CRIMINAL NETWORK ANALYSIS PLATFORM")
    print("=" * 70)
    print("Initializing DataStore and starting local server on http://127.0.0.1:8000 ...")

    # Start browser opener in background thread
    threading.Thread(target=open_browser, daemon=True).start()

    try:
        import uvicorn
        uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
    except KeyboardInterrupt:
        print("\n[OK] Server stopped by user.")
    except Exception as e:
        print(f"\n[ERROR] Server failed: {e}")
        input("Press Enter to exit...")
