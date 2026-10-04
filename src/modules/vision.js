
import screenshot from 'screenshot-desktop';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import fs from 'fs';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import { buildMemoryContext } from './memory.js';
import { PYTHON_CMD } from '../utils/python.js';

dotenv.config();

const PROVIDER = (process.env.PROVIDER || 'gemini').toLowerCase();
console.log(`🤖 Vision Provider: ${PROVIDER.toUpperCase()}${PROVIDER === 'both' ? ' (Groq + Gemini racing)' : ''}`);

// --- Gemini Setup ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

// --- Groq Setup ---
const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- Screenshot diff state ---
let prevScreenBuffer = null;

/**
 * Reset the diff state — call after executing actions so the next capture is always analyzed.
 */
export function resetScreenDiff() {
    prevScreenBuffer = null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function saveDebugImage(buffer, x, y) {
    try {
        fs.writeFileSync('last_screen.png', buffer);
        spawn(PYTHON_CMD, ['src/tools/draw_debug.py', 'last_screen.png', x.toString(), y.toString()]);
    } catch (e) { /* ignore */ }
}

/**
 * Compare two PNG buffers and return the percentage of pixels that changed.
 */
async function getScreenDiff(currentBuffer) {
    if (!prevScreenBuffer) return 100; // First capture = 100% change

    try {
        // Resize both to small size for fast comparison
        const DIFF_WIDTH = 320;
        const DIFF_HEIGHT = 180;

        const [prevRaw, currRaw] = await Promise.all([
            sharp(prevScreenBuffer).resize(DIFF_WIDTH, DIFF_HEIGHT).ensureAlpha().raw().toBuffer(),
            sharp(currentBuffer).resize(DIFF_WIDTH, DIFF_HEIGHT).ensureAlpha().raw().toBuffer()
        ]);

        const diffPixels = pixelmatch(prevRaw, currRaw, null, DIFF_WIDTH, DIFF_HEIGHT, { threshold: 0.1 });
        const totalPixels = DIFF_WIDTH * DIFF_HEIGHT;
        return (diffPixels / totalPixels) * 100;
    } catch {
        return 100; // On error, assume changed
    }
}

/**
 * Compress screenshot for AI — JPEG quality 75, resized to 1280px max width.
 * Returns { buffer, scaleX, scaleY } so callers can map AI coords → real coords.
 */
async function compressForAI(pngBuffer, resolution) {
    try {
        const AI_WIDTH = 1280;
        const scaleX = resolution ? resolution.width  / AI_WIDTH : 1;
        const scaleY = resolution ? resolution.height / Math.round(resolution.height * AI_WIDTH / resolution.width) : 1;

        const buffer = await sharp(pngBuffer)
            .resize(AI_WIDTH, null, { withoutEnlargement: true })
            .jpeg({ quality: 75 })
            .toBuffer();

        return { buffer, scaleX, scaleY };
    } catch {
        return { buffer: pngBuffer, scaleX: 1, scaleY: 1 };
    }
}

function buildPrompt(goal, history, resolution, workingMemoryContext, planContext, intentContext, memoryContext) {
    const historyText = history.slice(-12).map((h, i) => `${i + 1}. ${h}`).join('\n');
    // Tell the AI exactly what image size it is analysing so its coords are correct
    const AI_WIDTH  = Math.min(resolution?.width  || 1920, 1280);
    const AI_HEIGHT = resolution ? Math.round(resolution.height * AI_WIDTH / resolution.width) : 720;
    const resText   = `${AI_WIDTH}x${AI_HEIGHT}`;

    const IS_WIN = process.platform === 'win32';
    const osName = IS_WIN ? 'Windows' : 'macOS';
    const searchHotkey = IS_WIN ? '["win","s"]' : '["command","space"]';
    const searchName = IS_WIN ? 'Windows Search' : 'macOS Spotlight Search';
    const focusHotkey = IS_WIN ? '["ctrl","l"]' : '["command","l"]';
    const closeHotkey = IS_WIN ? '["alt","f4"]' : '["command","q"]';
    const tabHotkey = IS_WIN ? '["ctrl","t"]' : '["command","t"]';
    const spotifyHotkey = IS_WIN ? '["ctrl","k"]' : '["command","k"]';
    const focusDisplay = IS_WIN ? 'ctrl+l' : 'command+l';
    const spotifyDisplay = IS_WIN ? 'ctrl+k' : 'command+k';

    const parts = [
        `You are an autonomous ${osName} desktop automation agent.`,
        "",
        `GOAL: "${goal}"`,
        `SCREEN RESOLUTION OF THIS screenshot: ${resText} pixels`,
        "",
    ];

    if (intentContext)       { parts.push(intentContext, ""); }
    if (planContext)         { parts.push(`CURRENT PLAN STEP: ${planContext}`, ""); }
    if (workingMemoryContext){ parts.push(workingMemoryContext, ""); }
    if (memoryContext)       { parts.push(memoryContext, ""); }

    parts.push(
        "RECENT HISTORY (last 12 steps):",
        historyText || "(No actions taken yet)",
        "",
        "─── AVAILABLE ACTIONS ───",
        IS_WIN ?
        `1. { "action": "hotkey",           "keys": ${focusHotkey} }      — focus address/search bar in most apps
2. { "action": "ui_click_input"   }                             — click the FIRST text input in the window
3. { "action": "hotkey",           "keys": ${searchHotkey} }        — open ${searchName}
4. { "action": "press",            "key": "enter" }             — confirm / open top search result
5. { "action": "type",             "text": "hello" }            — type text (MUST focus field first!)
6. { "action": "ui_click",         "label": "Submit" }          — click button/nav by EXACT name
7. { "action": "ui_click_partial", "label": "Spot" }            — click element by PARTIAL name
8. { "action": "click",            "x": 640, "y": 360 }         — coordinate click at pixel x,y on this ${AI_WIDTH}x${AI_HEIGHT} screenshot
9. { "action": "scroll",           "amount": 3 }                — scroll (negative = down)
10.{ "action": "wait",             "duration": 800 }            — wait ms for UI to load
11.{ "action": "spotify_play"      }                             — keyboard-navigate to Spotify top result and play it
12.{ "action": "shell",           "cmd": "..." }                — execute native shell command`
        :
        `1. { "action": "shell",           "cmd": "open -a Music" }      — execute native shell command (e.g., open -a Music, open -a "Google Chrome")
2. { "action": "applescript",     "script": "..." }            — run AppleScript (e.g., tell application "Music" to play, or pause video)
3. { "action": "hotkey",           "keys": ${focusHotkey} }      — focus address/search bar in apps/browsers
4. { "action": "hotkey",           "keys": ${searchHotkey} }        — open Spotlight Search
5. { "action": "type",             "text": "hello" }            — type text (focus field first!)
6. { "action": "press",            "key": "space" }             — press spacebar or enter (e.g. key: "k" or "space" to pause/play video)
7. { "action": "click",            "x": 640, "y": 360 }         — click at pixel x,y on this ${AI_WIDTH}x${AI_HEIGHT} screenshot (e.g. 640, 360 is screen center)
8. { "action": "double_click",     "x": 640, "y": 360 }         — double-click at pixel x,y on this ${AI_WIDTH}x${AI_HEIGHT} screenshot
9. { "action": "scroll",           "amount": 3 }                — scroll up/down
10.{ "action": "wait",             "duration": 800 }            — wait ms for UI`,
        "",
        "─── APP-SPECIFIC SHORTCUTS & MAC OS BEST PRACTICES ───",
        IS_WIN ? "" : "• Pause / Resume YouTube Video (macOS):\n   ✅ Method 1 (BEST): shell with 'open -a \"Google Chrome\"' (or Safari) then wait 200 then press \"k\" or \"space\"\n   ✅ Method 2: applescript with 'tell application \"Google Chrome\" to execute active tab of front window javascript \"document.querySelector(\\'video\\').paused ? document.querySelector(\\'video\\').play() : document.querySelector(\\'video\\').pause()\"'",
        IS_WIN ? "" : "• Apple Music (macOS):\n   ✅ Search & Open: shell with 'open \"music://music.apple.com/search?term=SONG_NAME\"' then wait 800 then press enter\n   ✅ Direct Play/Pause: applescript with 'tell application \"Music\" to play' (or pause)\n   ✅ Launch: shell with 'open -a Music'",
        IS_WIN ? "" : "• Web & Browsers (macOS):\n   ✅ Open URL: shell with 'open \"https://...\"' OR hotkey[command,l] → type URL → press enter",
        `• Spotify search bar:  hotkey${spotifyHotkey}  → focuses and clears the search field`,
        "• Spotify play song:   use spotify_play or double_click at song coordinates",
        IS_WIN
          ? "• Windows Search:      hotkey[win,s] → type → press enter"
          : "• Spotlight Search:    hotkey[command,space] → wait[600] → type → wait[300] → press enter",
        IS_WIN
          ? "• Launch native app:   hotkey[win,r] → type appname → press enter"
          : "• Launch native app:   shell with 'open -a \"AppName\"' (e.g. open -a Music, open -a \"Google Chrome\")",
        "",
        "─── CRITICAL RULES ───",
        "⛔ RULE 1 — NEVER use 'type' without focusing a text field first.",
        `   Always do ui_click_input OR hotkey${spotifyHotkey}/hotkey${focusHotkey} BEFORE type.`,
        "⛔ RULE 2 — ui_click NEVER works on browser web content (links, videos, search results).",
        "   Browser web page content is NOT in the UI accessibility tree.",
        "   To click a link or video in a browser: use 'click' with x,y coordinates instead.",
        "   ui_click only works on native app buttons (taskbar, Spotify nav, settings panels, etc.)",
        "⛔ RULE 3 — For YouTube: navigate directly with URL. Format:",
        "   youtube.com/results?search_query=YOUR+SEARCH  (finds videos instantly)",
        "   Then click on a video thumbnail using 'click' at its x,y position.",
        "⛔ RULE 4 — Same action 2+ times = it's not working. Switch strategy immediately.",
        "✅ RULE 5 — DONE when the goal is visually confirmed on screen or verified programmatically.",
        "   For 'play song/video': DONE when you see it playing in the player, OR (on macOS) when you run AppleScript to play it successfully. If the application is open in the background, you can use shell with 'open -a Music' to bring it to the foreground to see it, or use AppleScript to get the player state to verify it is playing.",
        `✅ RULE 6 — If stuck 3+ steps: close app with hotkey${closeHotkey} and try again fresh.`,
        "",
        "─── OUTPUT FORMAT (strict JSON, no markdown) ───",
        '{',
        '  "thought": "what I see and what I will do",',
        '  "status": "CONTINUE",',
        '  "actions": []',
        '}',
        'status: "CONTINUE" | "DONE" | "FAIL"',
        "Return ONLY the JSON object. Double-quotes only. No trailing commas."
    );

    return parts.join('\n');
}


function parseResponse(text) {
    let jsonStr = text.trim();
    jsonStr = jsonStr.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();

    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1) {
        console.error("No JSON object found in response.");
        return null;
    }

    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);

    try {
        return JSON.parse(jsonStr);
    } catch (parseErr) {
        console.log("Strict JSON parse failed, trying loose parse...");
        try {
            const loosely = new Function("return " + jsonStr)();
            console.log("✅ Recovered with loose parse!");
            return loosely;
        } catch (e) {
            console.log("❌ Fatal JSON Error:", e.message);
            return null;
        }
    }
}

async function analyzeWithGemini(imageBuffer, prompt, retries) {
    const imagePart = {
        inlineData: {
            data: imageBuffer.toString('base64'),
            mimeType: "image/jpeg"
        }
    };

    const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-3.6-flash"];
    let lastErr = null;

    for (const modelName of modelsToTry) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;
            return response.text();
        } catch (err) {
            lastErr = err;
            if (err.message && (err.message.includes('503') || err.message.includes('404') || err.message.includes('capacity') || err.message.includes('UNAVAILABLE'))) {
                console.warn(`⚠️ Gemini model ${modelName} 503/capacity limit. Retrying with fallback model...`);
                continue;
            }
            if (err.message && err.message.includes('429') && retries > 0) {
                const delay = (4 - retries) * 1000 + 1000;
                console.warn(`Rate limited (429). Retrying in ${delay / 1000}s...`);
                await sleep(delay);
                return analyzeWithGemini(imageBuffer, prompt, retries - 1);
            }
            throw err;
        }
    }
    throw lastErr;
}

async function analyzeWithGroq(imageBuffer, prompt, retries) {
    const base64Image = imageBuffer.toString('base64');

    try {
        const response = await groqClient.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                    ]
                }
            ],
            temperature: 0.2,
            max_tokens: 1024,
        });

        return response.choices[0]?.message?.content || '';
    } catch (err) {
        if (err.status === 429) {
            // Don't keep retrying Groq when rate-limited — just throw so Gemini takes over.
            console.warn(`Groq rate limited — switching to Gemini.`);
            throw err;
        }
        throw err;
    }
}


export async function captureScreen() {
    try {
        return await screenshot({ format: 'png' });
    } catch (err) {
        console.error("Failed to capture screen:", err);
        throw err;
    }
}

async function analyzeWith(provider, compressedBuffer, prompt, retries) {
    let text = '';
    if (provider === 'groq') {
        text = await analyzeWithGroq(compressedBuffer, prompt, retries);
    } else {
        text = await analyzeWithGemini(compressedBuffer, prompt, retries);
    }
    console.log(`Raw ${provider.toUpperCase()} response length: ${text.length}`);
    const parsed = parseResponse(text);
    if (!parsed) throw new Error(`${provider} returned invalid JSON`);
    return { provider, parsed };
}

/**
 * Main analysis function.
 * @param {Buffer} imageBuffer
 * @param {string} goal
 * @param {Array}  history
 * @param {object} resolution
 * @param {string} workingMemoryContext - from WorkingMemory.toPromptContext()
 * @param {string} planContext          - current plan step string
 * @param {string} intentContext        - from intentToContext()
 * @param {string} memoryContext        - from memory.js long-term recall
 * @param {number} retries
 */
export async function analyzeScreen(
    imageBuffer, goal, history, resolution,
    workingMemoryContext = '', planContext = '',
    intentContext = '', memoryContext = '', retries = 3
) {
    // --- Change detection ---
    const diffPercent = await getScreenDiff(imageBuffer);
    prevScreenBuffer = imageBuffer;

    if (diffPercent < 5) {
        console.log(`⚡ Screen unchanged (${diffPercent.toFixed(1)}% diff), skipping AI call`);
        return { thought: "Screen hasn't changed yet, waiting...", status: "CONTINUE", actions: [{ action: "wait", duration: 600 }], noChange: true };
    }

    // --- Compress for AI (get scale ratios too) ---
    const compressed = await compressForAI(imageBuffer, resolution);
    const prompt = buildPrompt(goal, history, resolution, workingMemoryContext, planContext, intentContext, memoryContext);

    /** Scale AI-space coords → real screen coords */
    function scaleCoords(parsed) {
        const resW = resolution?.width || 1920;
        const resH = resolution?.height || 1080;
        const { scaleX, scaleY } = compressed;

        const actions = (parsed.actions || []).map(a => {
            if (a.x != null && a.y != null) {
                let realX = a.x;
                let realY = a.y;

                if (a.x <= 1000 && a.y <= 1000 && a.x >= 0 && a.y >= 0) {
                    realX = Math.round((a.x / 1000) * resW);
                    realY = Math.round((a.y / 1000) * resH);
                } else {
                    realX = Math.round(a.x * scaleX);
                    realY = Math.round(a.y * scaleY);
                }
                return { ...a, x: realX, y: realY };
            }
            if (a.path) {
                return {
                    ...a,
                    path: a.path.map(([px, py]) => [
                        px <= 1000 ? Math.round((px / 1000) * resW) : Math.round(px * scaleX),
                        py <= 1000 ? Math.round((py / 1000) * resH) : Math.round(py * scaleY)
                    ])
                };
            }
            return a;
        });
        return { ...parsed, actions };
    }

    // --- Call AI ---
    if (PROVIDER === 'both') {
        try {
            const { provider, parsed } = await Promise.any([
                analyzeWith('groq', compressed.buffer, prompt, retries),
                analyzeWith('gemini', compressed.buffer, prompt, retries)
            ]);
            console.log(`✅ Winner: ${provider.toUpperCase()}`);
            const scaled = scaleCoords(parsed);
            const clickAction = (scaled.actions || []).find(a => a.action === 'click' || a.action === 'double_click');
            if (clickAction) saveDebugImage(imageBuffer, clickAction.x, clickAction.y);
            return scaled;
        } catch {
            console.error('Both providers failed.');
            return null;
        }
    }

    // Single provider with fallback
    const primary   = PROVIDER === 'groq' ? 'groq' : 'gemini';
    const secondary = PROVIDER === 'groq' ? 'gemini' : 'groq';

    for (const provider of [primary, secondary]) {
        try {
            const { parsed } = await analyzeWith(provider, compressed.buffer, prompt, retries);
            if (provider !== primary) console.warn(`⚠️ Used ${provider.toUpperCase()} as fallback.`);
            const scaled = scaleCoords(parsed);
            const clickAction = (scaled.actions || []).find(a => a.action === 'click' || a.action === 'double_click');
            if (clickAction) saveDebugImage(imageBuffer, clickAction.x, clickAction.y);
            return scaled;
        } catch (err) {
            console.error(`${provider.toUpperCase()} failed: ${err.message}`);
            if (provider === primary) console.warn(`🔄 Falling back to ${secondary.toUpperCase()}...`);
        }
    }

    console.error('Both providers failed.');
    return null;

}
