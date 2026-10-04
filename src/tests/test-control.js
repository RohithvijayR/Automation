
import * as control from '../modules/control.js';

async function run() {
    console.log("Testing Control Module...");

    console.log("Moving mouse to 500, 500...");
    await control.move(500, 500);

    console.log("Moving mouse to 600, 600...");
    await control.move(600, 600);

    console.log("Pressing 'win' key (start menu)...");
    await control.press('win');

    console.log("Waiting 2s...");
    await new Promise(r => setTimeout(r, 2000));

    console.log("Pressing 'esc'...");
    await control.press('esc');

    console.log("Done.");
    process.exit(0);
}

run().catch(console.error);
