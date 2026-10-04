
import { captureScreen, analyzeScreen } from '../modules/vision.js';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    console.log("Testing Full Stack (Vision + AI)...");

    try {
        console.log("Capturing screen...");
        const screenshot = await captureScreen();

        console.log("Sending to Gemini...");
        const result = await analyzeScreen(screenshot, "Open Notepad", []);

        console.log("Result:", result);

        if (result && result.status && result.actions) {
            console.log("SUCCESS: Plan generated via OODA loop.");
            console.log("Thought:", result.thought);
            console.log("Status:", result.status);
        } else {
            console.error("FAILURE: Invalid OODA response.");
            process.exit(1);
        }

    } catch (err) {
        console.error("Test failed:", err);
        process.exit(1);
    }
}

run();
