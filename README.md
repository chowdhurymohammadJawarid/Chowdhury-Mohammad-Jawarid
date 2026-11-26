# ULTRON — Advanced Personal Desktop AI Assistant

ULTRON is a completely free, open-source Windows desktop AI assistant built with Electron, Node.js, Express, React, TypeScript, Tailwind CSS, and Three.js.

## Features Implemented
- **3D Holographic Neural Core**: Interactive Three.js spherical core with concentric energy rings, radial light rays, audio-reactive wave bars, mouse-wheel zoom, two-finger pinch-to-zoom, and zoom reset controls.
- **Voice & Three-Clap Activation**: Local Web Audio bandpass three-clap transient detector (`180ms–2100ms` window) with noise filtering + continuous wake-word detection (`"Hey ULTRON"`, `"ULTRON"`, `"My buddy"`).
- **Realistic Female Voice System**: Free-tier Gemini Neural Female TTS (`Kore` / `Zephyr`) with instant offline Browser Female Speech Synthesis fallback and pitch/speed/tone/volume controls.
- **100% Free AI Brain**: Supports Hybrid Auto, Free-Tier Gemini (`gemini-4-hydrogen`), Local Open-Source LLMs via **Ollama** (`http://127.0.0.1:11434`), and a zero-dependency Offline NLU Command Engine.
- **Windows Desktop Control**: Native Win32/PowerShell application launcher & window manager (open, close, minimize, maximize, focus), system volume, display brightness, desktop screenshot capture, clipboard sync, and Windows Phone Link / WhatsApp / VoIP call staging.
- **Real-Time System Telemetry**: Live CPU, memory, storage, network interfaces, internet latency, running processes, Windows WMI battery/thermal sensors, and adaptive hardware profiling.
- **File Management**: Permission-based access (`ultron_workspace`, plus opt-in Desktop, Downloads, Documents), search by name/extension, recent files, SHA-256 duplicate scan, smart folder organization, DOCX/XLSX/PPTX/PDF/ZIP/TXT preview, and mandatory confirmation before delete/overwrite.

## Prerequisites (Windows 10 / 11)
1. **Node.js 22 LTS or newer**: https://nodejs.org/
2. *(Optional, 100% Free Local LLM)* **Ollama**: https://ollama.com/ (`ollama pull llama3.2`)
3. *(Optional, Free Tier Cloud AI)* A free Gemini API key in `.env` (`GEMINI_API_KEY=...`)

## Exact Windows PowerShell Setup & Run Commands

1. Download this project ZIP from AI Studio (`Download app`) and extract it to a folder such as `C:\ULTRON`.
2. Open **Windows PowerShell** inside that folder (`cd C:\ULTRON`) and run:

```powershell
# 1. Install dependencies & Electron desktop shell
npm install
npm install --save-dev electron electron-builder

# 2. Optional: copy env template if adding a free Gemini key (works offline/local without it)
Copy-Item .env.example .env

# 3. Verify all backend modules
npm test

# 4. Build & launch ULTRON natively on Windows (with System Tray & Ctrl+Shift+U hotkey)
npm run desktop
```

To build a standalone Windows installer (`release\ULTRON-Setup-0.0.0.exe` + portable `.exe`):
```powershell
npm run desktop:build
```
