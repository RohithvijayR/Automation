
import fs from 'fs';
import path from 'path';

const LOG_DIR = 'logs';
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR);
}

// Create a unique log file for this session based on timestamp
const SESSION_ID = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = path.join(LOG_DIR, `session_${SESSION_ID}.log`);

export function log(type, message, data = null) {
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}] [${type}] ${message}`;

    if (data) {
        logEntry += `\n${JSON.stringify(data, null, 2)}`;
    }

    logEntry += '\n';

    // Append to file
    fs.appendFileSync(LOG_FILE, logEntry);

    // Also optionally print to console (if not already handled by index.js)
    // console.log ignores are handled in index.js to avoid double printing
}

export function getLogFilePath() {
    return path.resolve(LOG_FILE);
}
