
import { captureScreen, analyzeScreen } from '../modules/vision.js';
import fs from 'fs';

async function run() {
    console.log("Testing Vision Module...");
    try {
        const img = await captureScreen();
        console.log(`Captured image: ${img.length} bytes`);
        fs.writeFileSync('test_capture.png', img);
        console.log("Saved to test_capture.png");

        // Optional: Test analysis if API key is valid
        // const result = await analyzeScreen(img, "Find the Start button");
        // console.log("Analysis result:", result);
    } catch (err) {
        console.error("Vision test failed:", err);
    }
}

run();
