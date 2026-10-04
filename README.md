# ☄️ Meteorid V5 — AI-Powered Windows Automation Agent

Meteorid is an autonomous Windows desktop automation agent powered by vision AI. It captures your screen, understands what's on it, and performs mouse/keyboard actions to complete your goals — all in natural language.

---

## 🚀 Features

### 🧠 Multi-Provider Vision AI
- **Dual-provider support**: Runs **Groq (Llama 4 Scout Vision)** and **Gemini (gemini-2.0-flash)** simultaneously
- **Race mode** (`PROVIDER=both`): Both AIs analyze each screenshot in parallel — the first valid response wins
- **Automatic fallback**: If the primary provider fails or rate-limits, the other kicks in instantly
- **Switchable via `.env`**: `PROVIDER=groq`, `PROVIDER=gemini`, or `PROVIDER=both`

### 🧠 Memory System *(NEW in V5)*
- Remembers successful goal→action sequences in `memory.json`
- Fuzzy-matches new goals against past successes
- Injects past solutions into the AI prompt for faster, smarter execution
- Auto-cleans old entries (keeps last 50 goals)

### 📋 Planning Layer *(NEW in V5)*
- Generates a **high-level plan** before execution (2-5 steps)
- Shows the plan to you: `📋 Plan: 1. Open Spotify  2. Search song  3. Click play`
- Each execution step knows which plan-step it's working on
- Adapts to current screen state while following the plan

### 🔒 Security System *(NEW in V5)*
- Three safety modes via `SAFE_MODE=`:
  - `true` → Blocks dangerous actions (cmd, powershell, regedit, etc.)
  - `test` → Warns ⚠️ but allows override (for development/testing)
  - `false` → No restrictions
- App blacklist prevents launching dangerous programs
- Action-level filtering before every execution

### ⚡ Performance Optimizations *(NEW in V5)*
- **Persistent Python process** — spawns once, reuses for all actions (~500ms saved per action)
- **JPEG compression** — screenshots compressed to JPEG quality 70, ~5x smaller AI payloads
- **Image resize** — screenshots scaled to 1280px width for AI (keeps original for debug)
- **Change detection** — compares screenshots via `pixelmatch`, skips AI call if <2% changed
- **Reduced delays** — inter-step delay cut from 1000ms to 300ms

### 🖥️ Screen Vision
- Full-resolution screenshot capture using `screenshot-desktop`
- Saves `last_screen.png` + draws red crosshair overlay (`debug_overlay.png`) on click targets

### 🤖 Autonomous Action Execution
| Action | Description |
|--------|-------------|
| `hotkey` | Press keyboard shortcuts (e.g. Win+S, Ctrl+C) |
| `ui_click` | Click UI elements by exact name (Windows Accessibility API) |
| `ui_click_partial` | Click elements by partial/fuzzy name match *(NEW)* |
| `ui_click_input` | Click the first text input box in the active window |
| `list_elements` | List all visible UI elements in the foreground window *(NEW)* |
| `type` | Type text into the focused element |
| `press` | Press a single key (Enter, Esc, Tab, etc.) |
| `right_click` | Right-click at coordinates |
| `double_click` | Double-click at coordinates |
| `click` | Coordinate-based click (last resort) |
| `scroll` | Scroll up/down |
| `move` | Move mouse to coordinates |
| `draw` | Draw freehand paths (drag mouse through points) |
| `wait` | Wait for UI to load |

### 🔁 Smart Loop Detection
- Detects when the agent is repeating the same action with no progress
- Automatically switches strategy after failures
- Screen change detection forces new approach after 3 unchanged frames
- DONE detection: knows when the goal is achieved

---

## 🛠️ Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://www.python.org/) (v3.10+)

### 1. Install Node.js dependencies
```bash
npm install
```

### 2. Install Python dependencies
```bash
pip install pyautogui uiautomation
```

### 3. Configure `.env`
```env
GEMINI_API_KEY=your_gemini_key_here
GROQ_API_KEY=your_groq_key_here
PROVIDER=both       # groq | gemini | both
SAFE_MODE=test      # true | test | false
```

---

## ▶️ Running

```bash
npm start
```
Or double-click `run.bat`.

You'll see:
```
☄️ Meteorid V5 — AI-Powered Windows Automation
🔒 Safe Mode: TEST
🤖 Vision Provider: BOTH (Groq + Gemini racing)
🖥️ Screen: 1920x1080

🎯 What is your GOAL? > open spotify and play a song

📋 Plan:
   1. Open Spotify via Win+R
   2. Search for the song
   3. Click play

--- Step 1 (Step 1/3 — Open Spotify via Win+R) ---
👀 Capturing & Analyzing...
✅ Winner: GROQ
▶ hotkey [win+r]
▶ type "spotify"
▶ press enter
```

Type `exit` to quit.

---

## 🧪 Testing

```bash
npm run test:control    # Test mouse/keyboard control
npm run test:vision     # Test screenshot capture
```

---

## 📁 Project Structure

```
Automation/
├── src/
│   ├── index.js              # Main agent loop (planner + executor)
│   ├── modules/
│   │   ├── vision.js         # AI vision + provider routing + change detection
│   │   ├── control.js        # JS → Python bridge (persistent process)
│   │   ├── control.py        # Mouse/keyboard executor + UI element finder
│   │   ├── planner.js        # High-level plan generator
│   │   ├── memory.js         # Goal memory (save/recall)
│   │   ├── security.js       # Action filtering + safe mode
│   │   └── logger.js         # Session file logger
│   ├── tests/                # Test scripts
│   └── tools/
│       └── draw_debug.py     # Debug overlay renderer
├── logs/                     # Auto-generated session logs
├── memory.json               # Persistent goal memory (auto-created)
├── .env                      # API keys + config
└── run.bat                   # Windows launcher
```

---

## ⚙️ Configuration

| Variable | Values | Description |
|----------|--------|-------------|
| `PROVIDER` | `groq` / `gemini` / `both` | AI vision provider |
| `SAFE_MODE` | `true` / `test` / `false` | Security level |
| `GEMINI_API_KEY` | API key | Google Gemini API key |
| `GROQ_API_KEY` | API key | Groq API key |

---

## ⚠️ Notes
- Move mouse to top-left corner to trigger PyAutoGUI fail-safe and stop the agent
- Max **20 steps** per goal (configurable via `MAX_STEPS` in `index.js`)
- Debug images (`last_screen.png`, `debug_overlay.png`) are overwritten each run
- Memory file (`memory.json`) persists between sessions
