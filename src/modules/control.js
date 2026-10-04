import { spawn } from 'child_process';
import path from 'path';
import { PYTHON_CMD } from '../utils/python.js';

// ---------------------------------------------------------------------------
// Command Queue — serializes all Python IPC calls so there is never more
// than one in-flight command.  Eliminates all stale-response / timeout-
// corruption issues that plagued the single-pendingResolve approach.
// ---------------------------------------------------------------------------

let pythonProcess = null;
const commandQueue = [];   // { command, resolve, reject, _waiting, timeoutId }
let processing = false;
let outputBuffer = '';

// ---------- process lifecycle ----------

function spawnProcess() {
    pythonProcess = spawn(PYTHON_CMD, ['src/modules/control.py']);

    pythonProcess.stdout.on('data', (data) => {
        outputBuffer += data.toString();
        const lines = outputBuffer.split('\n');

        for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            try {
                const parsed = JSON.parse(line);
                if (commandQueue.length > 0 && commandQueue[0]._waiting) {
                    const { resolve, timeoutId } = commandQueue.shift();
                    clearTimeout(timeoutId);
                    processing = false;
                    resolve(parsed);
                    processNext();
                }
            } catch (e) { /* non-JSON line, ignore */ }
        }

        outputBuffer = lines[lines.length - 1];
    });

    pythonProcess.stderr.on('data', () => { /* ignore Python warnings */ });

    pythonProcess.on('close', () => {
        pythonProcess = null;
        outputBuffer = '';
        processing = false;
        // Auto-respawn after a grace period if there are pending commands
        if (commandQueue.length > 0) {
            setTimeout(() => {
                spawnProcess();
                processNext();
            }, 500);
        }
    });

    pythonProcess.on('error', (err) => {
        while (commandQueue.length > 0) {
            const item = commandQueue.shift();
            clearTimeout(item.timeoutId);
            item.reject(err);
        }
        processing = false;
    });
}

function ensureProcess() {
    if (!pythonProcess || pythonProcess.killed) {
        outputBuffer = '';
        spawnProcess();
    }
}

// ---------- queue runner ----------

function processNext() {
    if (processing || commandQueue.length === 0) return;
    processing = true;

    ensureProcess();
    const item = commandQueue[0];
    item._waiting = true;

    // Per-command timeout — kills process on hang so queue can recover
    item.timeoutId = setTimeout(() => {
        commandQueue.shift();
        processing = false;

        if (pythonProcess && !pythonProcess.killed) {
            try { pythonProcess.kill(); } catch (_) {}
            pythonProcess = null;
        }
        outputBuffer = '';

        item.reject(new Error(`Command timed out: ${JSON.stringify(item.command).slice(0, 80)}`));

        // Give OS time to reap the killed process before spawning a new one
        setTimeout(() => processNext(), 600);
    }, 8000); // 8s — fast enough to catch Spotify UIA hangs

    pythonProcess.stdin.write(JSON.stringify(item.command) + '\n');
}

export function sendCommand(command) {
    return new Promise((resolve, reject) => {
        commandQueue.push({ command, resolve, reject, _waiting: false, timeoutId: null });
        processNext();
    });
}

// ---------- public API ----------

export const click         = (x, y)    => sendCommand({ action: 'click',           x, y });
export const doubleClick   = (x, y)    => sendCommand({ action: 'double_click',    x, y });
export const rightClick    = (x, y)    => sendCommand({ action: 'right_click',     x, y });
export const move          = (x, y)    => sendCommand({ action: 'move',            x, y });
export const type          = (text)    => sendCommand({ action: 'type',            text });
export const press         = (key)     => sendCommand({ action: 'press',           key });
export const hotkey        = (keys)    => sendCommand({ action: 'hotkey',          keys });
export const draw          = (path)    => sendCommand({ action: 'draw',            path });
export const uiClick       = (label)   => sendCommand({ action: 'ui_click',        label });
export const uiClickPartial= (label)   => sendCommand({ action: 'ui_click_partial',label });
export const uiClickInput  = (label)   => sendCommand({ action: 'ui_click_input',  label });
export const listElements  = ()        => sendCommand({ action: 'list_elements' });
export const scroll        = (amount)  => sendCommand({ action: 'scroll',          amount });
export const getClipboard  = ()        => sendCommand({ action: 'clipboard_get' });
export const setClipboard  = (text)    => sendCommand({ action: 'clipboard_set',   text });
export const runShell      = (cmd)     => sendCommand({ action: 'shell',           cmd });
export const spotifyPlay   = ()        => sendCommand({ action: 'spotify_play' });
export const applescript   = (script)  => sendCommand({ action: 'applescript',   script });

