
import { captureScreen, analyzeScreen } from '../modules/vision.js';
import dotenv from 'dotenv';
import { spawn } from 'child_process';

dotenv.config();

async function run() {
    console.log("Testing Shortcut Logic...");

    try {
        console.log("Capturing screen...");
        const screenshot = await captureScreen();

        console.log("Asking: 'Open Settings' (Expect Win+I)");
        const result = await analyzeScreen(screenshot, "Open Settings", [], { width: 1920, height: 1080 });

        console.log("Result:", JSON.stringify(result, null, 2));

        if (result && result.actions.some(a => a.action === 'hotkey' && a.keys.includes('i'))) {
            console.log("SUCCESS: Shortcut Win+I detected.");
        } else {
            console.error("FAILURE: Shortcut not used.");
        }

    } catch (err) {
        console.error("Test failed:", err);
    }
}

run();
