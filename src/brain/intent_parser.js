
/**
 * Intent Parser — NLP goal decomposition
 * Classifies what the user wants and extracts key entities.
 * Runs before the planner so the planner gets a richer input.
 */

const INTENT_PATTERNS = [
    // Media & Playback Controls
    { intent: 'PLAY_MEDIA',   pattern: /\b(play|listen|queue|put on|pause|pasue|stop|resume|unmute|mute|next|previous)\b/i },
    // App open
    { intent: 'OPEN_APP',     pattern: /\b(open|launch|start|run)\b/i },
    // Web / browser
    { intent: 'WEB_NAV',      pattern: /\b(go to|browse|navigate|search on|open.*website|visit)\b/i },
    // File / filesystem
    { intent: 'FILE_OP',      pattern: /\b(create|delete|rename|move|copy|make folder|new file)\b/i },
    // Communication
    { intent: 'COMMUNICATE',  pattern: /\b(send|message|email|whatsapp|meet|call|share)\b/i },
    // System
    { intent: 'SYSTEM_OP',    pattern: /\b(settings|volume|brightness|shutdown|restart|sleep|wifi)\b/i },
    // Code / IDE
    { intent: 'CODE',         pattern: /\b(code|vscode|terminal|run script|compile)\b/i },
    // General Q&A
    { intent: 'GENERAL_QA',   pattern: /\b(what|who|when|where|why|how|tell me|explain)\b/i },
];

const IS_WIN = process.platform === 'win32';

// Known app name aliases mapped per OS
const APP_ALIASES = IS_WIN ? {
    spotify: 'spotify',
    'apple music': 'music',
    music: 'music',
    chrome: 'chrome',
    edge: 'msedge',
    firefox: 'firefox',
    notepad: 'notepad',
    paint: 'mspaint',
    calculator: 'calc',
    explorer: 'explorer',
    settings: 'ms-settings',
    vscode: 'code',
    'vs code': 'code',
    whatsapp: 'whatsapp',
    gmail: 'gmail',
    youtube: 'youtube',
    outlook: 'outlook',
    teams: 'teams',
    zoom: 'zoom',
    discord: 'discord',
    slack: 'slack',
} : {
    'apple music': 'Music',
    music: 'Music',
    spotify: 'Spotify',
    chrome: 'Google Chrome',
    'google chrome': 'Google Chrome',
    safari: 'Safari',
    edge: 'Microsoft Edge',
    firefox: 'firefox',
    notepad: 'TextEdit',
    textedit: 'TextEdit',
    calculator: 'Calculator',
    terminal: 'Terminal',
    vscode: 'Visual Studio Code',
    'vs code': 'Visual Studio Code',
    finder: 'Finder',
    whatsapp: 'WhatsApp',
    gmail: 'gmail',
    youtube: 'youtube',
    slack: 'Slack',
    discord: 'Discord',
    zoom: 'zoom',
};

/**
 * Parse a natural language goal into structured intent + entities.
 * @param {string} goal
 * @returns {{ intent: string, app?: string, query?: string, target?: string, raw: string }}
 */
export function parseIntent(goal) {
    const lower = goal.toLowerCase().trim();

    // Detect intent
    let intent = 'GENERAL_QA';
    for (const { intent: name, pattern } of INTENT_PATTERNS) {
        if (pattern.test(lower)) {
            intent = name;
            break;
        }
    }

    // Extract app name
    let app = null;
    for (const [alias, canonical] of Object.entries(APP_ALIASES)) {
        if (lower.includes(alias)) {
            app = canonical;
            break;
        }
    }

    // Extract song/query (text after "play", "search for", "find", "open ... and play")
    let query = null;
    const songMatch = lower.match(/(?:play|search for|find|listen to|queue)\s+["']?([^"']+?)(?:\s+on\s+\w+)?$/i);
    if (songMatch) query = songMatch[1].trim();

    // Extract target (e.g., URL, filename)
    let target = null;
    const urlMatch = goal.match(/https?:\/\/[^\s]+/);
    if (urlMatch) target = urlMatch[0];

    return { intent, app, query, target, raw: goal };
}

/**
 * Format intent as a context string for the AI prompt.
 */
export function intentToContext(intentResult) {
    const { intent, app, query, target } = intentResult;
    const parts = [`INTENT: ${intent}`];
    if (app)    parts.push(`APP: ${app}`);
    if (query)  parts.push(`QUERY: "${query}"`);
    if (target) parts.push(`TARGET: ${target}`);
    return parts.join(' | ');
}
