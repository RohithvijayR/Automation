"""
auto_clicker.py
───────────────
PyAutoGUI Cross-Platform Automation Utility.

Key feature: Opens EVERY pinned / running app in the Taskbar (Windows)
              or the Dock (macOS) by reading button positions dynamically.

Requirements:
  Windows: pip install pyautogui pywin32
  macOS:   pip install pyautogui
"""

import sys
import os
import time
import pyautogui

# ── OS Detection ───────────────────────────────────────────────────────────────
IS_WINDOWS = sys.platform.startswith('win')
IS_MAC = sys.platform.startswith('darwin')

# ── Dynamic Imports ────────────────────────────────────────────────────────────
if IS_WINDOWS:
    import ctypes
    import ctypes.wintypes as wintypes
    import win32gui
    import win32api
    import win32con
    import win32process
elif IS_MAC:
    import subprocess
    import plistlib

# ── Safety ─────────────────────────────────────────────────────────────────────
pyautogui.FAILSAFE = True   # Slam mouse to top-left (0,0) to abort at any time
pyautogui.PAUSE    = 0.05   # Small global pause between PyAutoGUI calls


# ═══════════════════════════════════════════════════════════════════════════════
#  Windows Win32 Helpers
# ═══════════════════════════════════════════════════════════════════════════════
if IS_WINDOWS:
    # Toolbar messages
    TB_BUTTONCOUNT = 0x0418
    TB_GETITEMRECT = 0x041D
    TB_GETBUTTON   = 0x0417

    # VirtualAllocEx / ReadProcessMemory flags
    PROCESS_ALL_ACCESS   = 0x1F0FFF
    MEM_COMMIT           = 0x1000
    PAGE_READWRITE       = 0x04
    MEM_RELEASE          = 0x8000

    class RECT(ctypes.Structure):
        """Win32 RECT structure."""
        _fields_ = [
            ("left",   ctypes.c_long),
            ("top",    ctypes.c_long),
            ("right",  ctypes.c_long),
            ("bottom", ctypes.c_long),
        ]

    def _read_remote_rect(process_handle, hwnd_toolbar, btn_index) -> RECT | None:
        """
        Ask the toolbar (in another process) to write a RECT into shared memory,
        then read it back with ReadProcessMemory.
        """
        k32 = ctypes.windll.kernel32

        # Allocate memory inside the remote process
        buf = k32.VirtualAllocEx(
            process_handle, None,
            ctypes.sizeof(RECT),
            MEM_COMMIT, PAGE_READWRITE
        )
        if not buf:
            return None

        try:
            # Tell the toolbar to fill that remote buffer
            win32api.SendMessage(hwnd_toolbar, TB_GETITEMRECT, btn_index, buf)

            # Read it back
            rect      = RECT()
            bytes_got = ctypes.c_size_t(0)
            ok = k32.ReadProcessMemory(
                process_handle, buf,
                ctypes.byref(rect), ctypes.sizeof(RECT),
                ctypes.byref(bytes_got)
            )
            return rect if ok else None
        finally:
            k32.VirtualFreeEx(process_handle, buf, 0, MEM_RELEASE)

    def _find_task_list_hwnd() -> int:
        """
        Walk the taskbar window hierarchy to find MSTaskListWClass.
        """
        tray = win32gui.FindWindow("Shell_TrayWnd", None)
        if not tray:
            raise RuntimeError("Cannot find Shell_TrayWnd – is the taskbar visible?")

        rebar = win32gui.FindWindowEx(tray,  None, "ReBarWindow32",  None)
        sw    = win32gui.FindWindowEx(rebar, None, "MSTaskSwWClass", None)

        if not sw:
            sw = win32gui.FindWindowEx(tray, None, "MSTaskSwWClass", None)

        task_list = win32gui.FindWindowEx(sw, None, "MSTaskListWClass", None)
        if not task_list:
            raise RuntimeError(
                "Cannot find MSTaskListWClass. "
                "Try running as Administrator, or your taskbar may not be standard."
            )
        return task_list


# ═══════════════════════════════════════════════════════════════════════════════
#  macOS AppleScript & Plist Helpers
# ═══════════════════════════════════════════════════════════════════════════════
if IS_MAC:
    def get_mac_dock_plist_apps():
        """Reads persistent apps from com.apple.dock.plist as a fallback."""
        try:
            plist_path = os.path.expanduser("~/Library/Preferences/com.apple.dock.plist")
            if not os.path.exists(plist_path):
                return []
            
            with open(plist_path, 'rb') as fp:
                pl = plistlib.load(fp)
            
            persistent_apps = pl.get('persistent-apps', [])
            apps = []
            for app in persistent_apps:
                tile_data = app.get('tile-data', {})
                label = tile_data.get('file-label', '')
                bundle_id = tile_data.get('bundle-identifier', '')
                if label:
                    apps.append({
                        "name": label,
                        "bundle_id": bundle_id
                    })
            return apps
        except Exception:
            return []

    def get_mac_dock_apps():
        """
        Attempts to retrieve macOS Dock apps and their positions using AppleScript UI scripting.
        """
        applescript = '''
        tell application "System Events"
            if not (exists process "Dock") then
                return "error: Dock process not found"
            end if
            try
                tell process "Dock"
                    set dock_list to list 1
                    set item_count to count of UI elements of dock_list
                    set result_list to {}
                    repeat with i from 1 to item_count
                        set elem to UI element i of dock_list
                        set elem_name to name of elem
                        set elem_pos to position of elem
                        set elem_size to size of elem
                        set end of result_list to elem_name & "|" & (item 1 of elem_pos) & "|" & (item 2 of elem_pos) & "|" & (item 1 of elem_size) & "|" & (item 2 of elem_size)
                    end repeat
                    return result_list
                end tell
            on error errText number errNum
                return "error: " & errText
            end try
        end tell
        '''
        try:
            res = subprocess.run(['osascript', '-e', applescript], capture_output=True, text=True, timeout=5)
            output = res.stdout.strip()
            if output and not output.startswith("error:"):
                parts = [p.strip() for p in output.split(", ") if p.strip()]
                items = []
                for part in parts:
                    subparts = part.split('|')
                    if len(subparts) == 5:
                        name, x, y, w, h = subparts
                        if name in ["", "Separator", "Downloads", "Trash", "Stack", "Separator volume"]:
                            continue
                        items.append({
                            "name": name,
                            "x": float(x),
                            "y": float(y),
                            "w": float(w),
                            "h": float(h),
                            "source": "AppleScript"
                        })
                return items, None
        except Exception as e:
            return None, str(e)
        
        return None, "Accessibility permissions not granted or AppleScript failed."


# ═══════════════════════════════════════════════════════════════════════════════
#  Unified Core Features
# ═══════════════════════════════════════════════════════════════════════════════

def list_launcher_items():
    """
    Print the screen position of every Taskbar (Windows) or Dock (macOS) button
    without clicking anything. Useful for dry runs.
    """
    print("=" * 58)
    print("  Launcher Button Inspector (no clicks)")
    print("=" * 58)

    if IS_WINDOWS:
        try:
            task_list_hwnd = _find_task_list_hwnd()
        except RuntimeError as exc:
            print(f"❌ {exc}")
            return

        btn_count = win32api.SendMessage(task_list_hwnd, TB_BUTTONCOUNT, 0, 0)
        print(f"✅ Found {btn_count} taskbar button(s)\n")

        _, pid = win32process.GetWindowThreadProcessId(task_list_hwnd)
        process_handle = ctypes.windll.kernel32.OpenProcess(PROCESS_ALL_ACCESS, False, pid)
        if not process_handle:
            print("❌ OpenProcess failed.")
            return

        tl_rect = win32gui.GetWindowRect(task_list_hwnd)

        try:
            for i in range(btn_count):
                rect = _read_remote_rect(process_handle, task_list_hwnd, i)
                if rect:
                    sx = tl_rect[0] + (rect.left + rect.right)  // 2
                    sy = tl_rect[1] + (rect.top  + rect.bottom) // 2
                    print(f"  Button {i:>2} → screen ({sx:>5}, {sy:>5})  "
                          f"[rect: {rect.left},{rect.top} → {rect.right},{rect.bottom}]")
                else:
                    print(f"  Button {i:>2} → ⚠️  unreadable")
        finally:
            ctypes.windll.kernel32.CloseHandle(process_handle)

    elif IS_MAC:
        print("🔍 Scanning macOS Dock elements...")
        items, err = get_mac_dock_apps()
        if items:
            print(f"✅ Found {len(items)} Dock items via AppleScript:\n")
            for i, item in enumerate(items):
                cx = item["x"] + item["w"] / 2
                cy = item["y"] + item["h"] / 2
                print(f"  Item {i:>2}: {item['name']:<25} → Center Screen ({cx:>6.1f}, {cy:>6.1f}) "
                      f"[Bounds: x={item['x']}, y={item['y']}, w={item['w']}, h={item['h']}]")
        else:
            print(f"⚠️  UI Automation failed: {err or 'Unknown error'}")
            print("ℹ️  This usually means Terminal/VS Code does not have Accessibility permissions.")
            print("   Checking the Dock plist configuration fallback...\n")
            
            plist_apps = get_mac_dock_plist_apps()
            if plist_apps:
                print(f"📂 Found {len(plist_apps)} apps via plist configuration:")
                for i, app in enumerate(plist_apps):
                    print(f"  Item {i:>2}: {app['name']:<25} (Bundle: {app['bundle_id']})")
            else:
                print("❌ Could not read plist or AppleScript Dock apps.")
    else:
        print("❌ Unsupported Operating System")


def open_all_launcher_apps(delay: float = 1.5, skip_start: bool = True):
    """
    Click or open every pinned/running app in the Taskbar (Windows) or Dock (macOS).
    """
    print("=" * 58)
    print("  Launcher App Opener")
    print("=" * 58)

    if IS_WINDOWS:
        try:
            task_list_hwnd = _find_task_list_hwnd()
        except RuntimeError as exc:
            print(f"❌ {exc}")
            return

        btn_count = win32api.SendMessage(task_list_hwnd, TB_BUTTONCOUNT, 0, 0)
        print(f"✅ Found {btn_count} taskbar button(s)")

        if btn_count == 0:
            print("No buttons found – nothing to click.")
            return

        _, pid = win32process.GetWindowThreadProcessId(task_list_hwnd)
        process_handle = ctypes.windll.kernel32.OpenProcess(PROCESS_ALL_ACCESS, False, pid)
        if not process_handle:
            print("❌ Could not open taskbar process. Try running as Administrator.")
            return

        try:
            tl_rect = win32gui.GetWindowRect(task_list_hwnd)
            tl_origin_x, tl_origin_y = tl_rect[0], tl_rect[1]
        except Exception:
            tl_origin_x, tl_origin_y = 0, 0

        start_idx = 1 if skip_start else 0

        try:
            for i in range(start_idx, btn_count):
                rect = _read_remote_rect(process_handle, task_list_hwnd, i)
                if rect is None:
                    print(f"  ⚠️  Button {i+1}: could not read rect — skipping")
                    continue

                screen_x = tl_origin_x + (rect.left + rect.right)  // 2
                screen_y = tl_origin_y + (rect.top  + rect.bottom) // 2

                print(f"  🖱  Button {i+1:>2}/{btn_count}  screen=({screen_x}, {screen_y})")
                pyautogui.click(screen_x, screen_y)
                time.sleep(delay)
        finally:
            ctypes.windll.kernel32.CloseHandle(process_handle)

    elif IS_MAC:
        items, err = get_mac_dock_apps()
        start_idx = 1 if skip_start else 0  # Finder is typically item 0

        if items:
            print(f"✅ Found {len(items)} Dock items via AppleScript.")
            print("   Using PyAutoGUI for visual mouse-click automation...\n")
            
            for i in range(start_idx, len(items)):
                item = items[i]
                cx = item["x"] + item["w"] / 2
                cy = item["y"] + item["h"] / 2
                print(f"  🖱  Clicking '{item['name']}' at screen=({cx:.1f}, {cy:.1f})")
                pyautogui.click(cx, cy)
                time.sleep(delay)
        else:
            print(f"⚠️  Visual clicking unavailable: {err}")
            print("🔗 Launching apps programmatically using plist fallback instead...\n")
            plist_apps = get_mac_dock_plist_apps()
            if not plist_apps:
                print("❌ No apps found via plist. Cannot launch.")
                return
            
            for i in range(start_idx, len(plist_apps)):
                app = plist_apps[i]
                print(f"  🚀 Launching programmatically: '{app['name']}'...")
                if app.get("bundle_id"):
                    subprocess.run(["open", "-b", app["bundle_id"]])
                else:
                    subprocess.run(["open", "-a", app["name"]])
                time.sleep(delay)
    else:
        print("❌ Unsupported Operating System")
        return

    print("\n🎉 Done — all launcher apps activated!")


# ═══════════════════════════════════════════════════════════════════════════════
#  General-purpose helpers (kept from original)
# ═══════════════════════════════════════════════════════════════════════════════

def get_mouse_position():
    """Print live mouse coordinates. Press Ctrl+C to stop."""
    print("📍 Mouse tracker — Ctrl+C to quit")
    try:
        while True:
            x, y = pyautogui.position()
            print(f"  X: {x:>5}  Y: {y:>5}", end="\r")
            time.sleep(0.4)
    except KeyboardInterrupt:
        print("\n✅ Stopped.")


def single_click(x: int, y: int, delay: float = 0.0):
    time.sleep(delay)
    pyautogui.click(x, y)
    print(f"🖱  Left-click    → ({x}, {y})")


def double_click(x: int, y: int, delay: float = 0.0):
    time.sleep(delay)
    pyautogui.doubleClick(x, y)
    print(f"🖱  Double-click  → ({x}, {y})")


def right_click(x: int, y: int, delay: float = 0.0):
    time.sleep(delay)
    pyautogui.rightClick(x, y)
    print(f"🖱  Right-click   → ({x}, {y})")


def repeat_click(x: int, y: int, count: int = 5, interval: float = 0.5):
    print(f"🔁 Repeating ({x},{y}) × {count}  interval={interval}s")
    for i in range(1, count + 1):
        pyautogui.click(x, y)
        print(f"   {i}/{count}")
        if i < count:
            time.sleep(interval)
    print("✅ Done.")


def drag_and_drop(fx: int, fy: int, tx: int, ty: int, duration: float = 0.5):
    pyautogui.moveTo(fx, fy, duration=0.2)
    pyautogui.dragTo(tx, ty, duration=duration, button="left")
    print(f"↔️  Drag ({fx},{fy}) → ({tx},{ty})")


def scroll_at(x: int, y: int, clicks: int = 3, direction: str = "up"):
    pyautogui.moveTo(x, y, duration=0.2)
    pyautogui.scroll(clicks if direction == "up" else -clicks)
    print(f"🖱  Scroll {direction} ×{clicks} at ({x},{y})")


def press_hotkey(*keys):
    pyautogui.hotkey(*keys)
    print(f"⌨️  {' + '.join(keys)}")


def type_text(text: str, interval: float = 0.05):
    pyautogui.typewrite(text, interval=interval)
    print(f"⌨️  Typed: {text!r}")


# ═══════════════════════════════════════════════════════════════════════════════
#  Entry point
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    # ── STEP 1: inspect first (safe, no clicks) ────────────────────────────────
    list_launcher_items()

    print("\n⏳ Opening all launcher apps in 3 seconds …")
    print("   Move mouse to top-left corner (0,0) to ABORT!\n")
    time.sleep(3)

    # ── STEP 2: click/open every app (skip Finder/Start at index 0) ────────────
    open_all_launcher_apps(delay=1.5, skip_start=True)
