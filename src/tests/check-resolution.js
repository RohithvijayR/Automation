
import { captureScreen } from '../modules/vision.js';
import fs from 'fs';
import { spawn } from 'child_process';
import { PYTHON_CMD } from '../utils/python.js';

async function run() {
    console.log("Capturing screen...");
    const buffer = await captureScreen();
    fs.writeFileSync('debug_screen.png', buffer);

    console.log("Analyzing resolution...");
    const pythonProcess = spawn(PYTHON_CMD, ['src/tests/check_res.py', 'debug_screen.png']);

    pythonProcess.stdout.on('data', (data) => {
        console.log(data.toString());
    });
}

run();
