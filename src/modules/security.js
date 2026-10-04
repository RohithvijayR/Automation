
import dotenv from 'dotenv';

dotenv.config();

const SAFE_MODE = (process.env.SAFE_MODE || 'false').toLowerCase(); // true | test | false

// Apps that should never be launched
const BLACKLISTED_APPS = [
    'cmd', 'cmd.exe',
    'powershell', 'pwsh',
    'regedit', 'regedit.exe',
    'taskmgr',
    'reg ',  // registry commands
    'del ', 'rmdir', 'rd ',  // delete commands
    'format ',
    'shutdown',
    'taskkill',
];

// Keys that could be dangerous in combination
const DANGEROUS_HOTKEYS = [
    // Alt+F4 is fine (close app) — not blacklisted
];

/**
 * Check if an action is safe to execute.
 * Returns { allowed: boolean, reason?: string }
 */
export function checkAction(action) {
    if (SAFE_MODE === 'false') {
        return { allowed: true };
    }

    const issues = [];

    // Check 'type' actions for blacklisted app names
    if (action.action === 'type' && action.text) {
        const lower = action.text.toLowerCase().trim();
        for (const app of BLACKLISTED_APPS) {
            if (lower === app || lower.startsWith(app)) {
                issues.push(`Blocked typing "${action.text}" — matches blacklisted command "${app}"`);
            }
        }
    }

    // Check hotkey combos
    if (action.action === 'hotkey' && action.keys) {
        const keyStr = action.keys.map(k => k.toLowerCase()).join('+');
        for (const combo of DANGEROUS_HOTKEYS) {
            if (keyStr === combo) {
                issues.push(`Blocked hotkey [${keyStr}] — dangerous shortcut`);
            }
        }
    }

    if (issues.length === 0) {
        return { allowed: true };
    }

    const reason = issues.join('; ');

    // In test mode: warn but allow
    if (SAFE_MODE === 'test') {
        return { allowed: true, testOverride: true, reason };
    }

    // In true mode: block
    return { allowed: false, reason };
}

/**
 * Get current safe mode for display.
 */
export function getSafeMode() {
    return SAFE_MODE;
}
