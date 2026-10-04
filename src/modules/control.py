
import pyautogui
import sys
import json
import subprocess
import ctypes
import pyperclip

# ── DPI awareness ────────────────────────────────────────────────────────────
# Declare this process as Per-Monitor DPI Aware so pyautogui coordinates
# map 1-to-1 to real screen pixels, regardless of Windows display scaling.
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)  # PROCESS_PER_MONITOR_DPI_AWARE
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()   # Fallback for older Windows
    except Exception:
        pass

# Fail-safe: move mouse to top-left to abort
pyautogui.FAILSAFE = True

try:
    import uiautomation as auto
    UIA_AVAILABLE = True
except ImportError:
    UIA_AVAILABLE = False

# -------------------------------------------------------------------------
# UI element helpers
# -------------------------------------------------------------------------

def find_element_center(name):
    if not UIA_AVAILABLE:
        return None
    try:
        for depth in [3, 5, 8]:
            for ctrl in [auto.ButtonControl, auto.EditControl, auto.TextControl,
                         auto.ListItemControl, auto.HyperlinkControl, auto.Control]:
                el = ctrl(Name=name, searchDepth=depth)
                if el.Exists(0.1, 0):
                    r = el.BoundingRectangle
                    return ((r.left + r.right) // 2, (r.top + r.bottom) // 2)
        return None
    except Exception:
        return None

def find_element_partial(name):
    if not UIA_AVAILABLE:
        return None
    try:
        fw = auto.GetForegroundControl()
        if not fw:
            return None
        return _search_partial(fw, name.lower(), 5, 0)
    except Exception:
        return None

def _search_partial(ctrl, name_lower, max_depth, depth):
    if depth > max_depth:
        return None
    try:
        n = ctrl.Name or ''
        if name_lower in n.lower():
            r = ctrl.BoundingRectangle
            if r.right > r.left and r.bottom > r.top:
                return ((r.left + r.right) // 2, (r.top + r.bottom) // 2, n)
    except Exception:
        pass
    try:
        for child in ctrl.GetChildren():
            res = _search_partial(child, name_lower, max_depth, depth + 1)
            if res:
                return res
    except Exception:
        pass
    return None

def find_input_center(name=None):
    if not UIA_AVAILABLE:
        return None
    try:
        fw = auto.GetForegroundControl()
        if not fw:
            return None
        for depth in [3, 5, 8]:
            el = fw.EditControl(Name=name, searchDepth=depth) if name else fw.EditControl(searchDepth=depth)
            if el.Exists(0.3, 0):
                r = el.BoundingRectangle
                return ((r.left + r.right) // 2, (r.top + r.bottom) // 2)
        return None
    except Exception:
        return None

def list_visible_elements():
    if not UIA_AVAILABLE:
        return []
    try:
        fw = auto.GetForegroundControl()
        if not fw:
            return []
        results = []
        _collect(fw, results, 4, 0)
        return results
    except Exception:
        return []

def _collect(ctrl, results, max_depth, depth):
    if depth > max_depth or len(results) >= 30:
        return
    try:
        name = ctrl.Name
        ctype = ctrl.ControlTypeName
        if name and name.strip() and ctype in (
            'ButtonControl', 'EditControl', 'TextControl',
            'ListItemControl', 'HyperlinkControl', 'MenuItemControl',
            'TabItemControl', 'CheckBoxControl'
        ):
            r = ctrl.BoundingRectangle
            if r.right > r.left and r.bottom > r.top:
                results.append({
                    'name': name.strip(),
                    'type': ctype.replace('Control', ''),
                    'x': (r.left + r.right) // 2,
                    'y': (r.top + r.bottom) // 2
                })
    except Exception:
        pass
    try:
        for child in ctrl.GetChildren():
            if len(results) >= 30:
                return
            _collect(child, results, max_depth, depth + 1)
    except Exception:
        pass

# -------------------------------------------------------------------------
# Command dispatcher
# -------------------------------------------------------------------------

def process_command(cmd):
    action = cmd.get('action')
    try:
        # --- Mouse ---
        if action == 'click':
            pyautogui.moveTo(cmd['x'], cmd['y'], duration=0.15, tween=pyautogui.easeInOutQuad)
            pyautogui.click()

        elif action == 'double_click':
            pyautogui.moveTo(cmd['x'], cmd['y'], duration=0.15, tween=pyautogui.easeInOutQuad)
            pyautogui.doubleClick()

        elif action == 'right_click':
            pyautogui.moveTo(cmd['x'], cmd['y'], duration=0.2, tween=pyautogui.easeInOutQuad)
            pyautogui.rightClick()

        elif action == 'move':
            pyautogui.moveTo(cmd['x'], cmd['y'], duration=0.1)

        elif action == 'scroll':
            pyautogui.scroll(cmd.get('amount', 3))

        elif action == 'draw':
            path = cmd.get('path', [])
            if len(path) > 1:
                old_pause = pyautogui.PAUSE
                pyautogui.PAUSE = 0
                try:
                    pyautogui.moveTo(path[0][0], path[0][1])
                    pyautogui.mouseDown()
                    for pt in path[1:]:
                        pyautogui.moveTo(pt[0], pt[1], duration=0)
                    pyautogui.mouseUp()
                finally:
                    pyautogui.PAUSE = old_pause

        # --- Keyboard ---
        elif action == 'type':
            pyautogui.write(cmd.get('text', ''), interval=0.03)

        elif action == 'press':
            pyautogui.press(cmd.get('key', ''))

        elif action == 'hotkey':
            keys = cmd.get('keys', [])
            if isinstance(keys, list) and keys:
                pyautogui.hotkey(*keys)
            else:
                return {'status': 'error', 'message': 'hotkey requires a list of keys'}

        # --- UI Automation ---
        elif action == 'ui_click':
            label = cmd.get('label', '')
            center = find_element_center(label)
            if center:
                pyautogui.moveTo(center[0], center[1], duration=0.15, tween=pyautogui.easeInOutQuad)
                pyautogui.click()
                return {'status': 'success', 'message': f"Clicked '{label}' at {center}"}
            return {'status': 'error', 'message': f"Element '{label}' not found"}

        elif action == 'ui_click_partial':
            label = cmd.get('label', '')
            res = find_element_partial(label)
            if res:
                cx, cy, actual = res
                pyautogui.moveTo(cx, cy, duration=0.15, tween=pyautogui.easeInOutQuad)
                pyautogui.click()
                return {'status': 'success', 'message': f"Clicked '{actual}' (partial match for '{label}')"}
            return {'status': 'error', 'message': f"No partial match for '{label}'"}

        elif action == 'ui_click_input':
            label = cmd.get('label', None)
            center = find_input_center(label)
            if center:
                pyautogui.moveTo(center[0], center[1], duration=0.15, tween=pyautogui.easeInOutQuad)
                pyautogui.click()
                return {'status': 'success', 'message': f"Clicked input at {center}"}
            return {'status': 'error', 'message': 'No text input found'}

        elif action == 'list_elements':
            elements = list_visible_elements()
            return {'status': 'success', 'elements': elements}

        # --- Spotify: keyboard-navigate to first result and play it ---
        elif action == 'spotify_play':
            import time
            # Press Tab to enter the results grid, then Enter to play the focused item
            # In Spotify search results the first Tab from the page focuses the top result card
            pyautogui.press('tab')
            time.sleep(0.3)
            pyautogui.press('enter')
            time.sleep(0.3)
            return {'status': 'success', 'message': 'Pressed Tab+Enter to play top Spotify result'}

        # --- Clipboard ---
        elif action == 'clipboard_get':
            text = pyperclip.paste()
            return {'status': 'success', 'text': text}

        elif action == 'clipboard_set':
            pyperclip.copy(cmd.get('text', ''))

        # --- Shell / CLI ---
        elif action == 'shell':
            command = cmd.get('cmd', '')
            result = subprocess.run(
                command, shell=True,
                capture_output=True, text=True, timeout=15
            )
            return {
                'status': 'success',
                'stdout': result.stdout[:2000],
                'stderr': result.stderr[:500],
                'returncode': result.returncode
            }

        # --- macOS AppleScript ---
        elif action == 'applescript':
            import sys
            if sys.platform != 'darwin':
                return {'status': 'error', 'message': 'AppleScript is only supported on macOS.'}
            script = cmd.get('script', '')
            try:
                result = subprocess.run(
                    ['osascript', '-e', script],
                    capture_output=True, text=True, timeout=10
                )
                if result.returncode == 0:
                    return {'status': 'success', 'stdout': result.stdout.strip()}
                else:
                    return {'status': 'error', 'message': f"AppleScript error: {result.stderr.strip()}"}
            except Exception as e:
                return {'status': 'error', 'message': f"Failed to run AppleScript: {str(e)}"}

        # --- System ---
        elif action == 'get_resolution':
            w, h = pyautogui.size()
            return {'status': 'success', 'width': w, 'height': h}

        else:
            return {'status': 'error', 'message': f"Unknown action: {action}"}

        return {'status': 'success'}

    except Exception as e:
        return {'status': 'error', 'message': str(e)}


# -------------------------------------------------------------------------
# Persistent stdin loop
# -------------------------------------------------------------------------

if __name__ == '__main__':
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
            result = process_command(cmd)
            print(json.dumps(result), flush=True)
        except json.JSONDecodeError:
            print(json.dumps({'status': 'error', 'message': 'Invalid JSON'}), flush=True)
        except Exception as e:
            print(json.dumps({'status': 'error', 'message': str(e)}), flush=True)
