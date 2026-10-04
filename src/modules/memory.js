
import fs from 'fs';
import path from 'path';

const MEMORY_FILE = path.join('memory.json');

/**
 * Load memory from disk.
 */
export function loadMemory() {
    try {
        if (fs.existsSync(MEMORY_FILE)) {
            return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
        }
    } catch (e) {
        console.warn("⚠️ Failed to load memory, starting fresh.");
    }
    return { goals: [] };
}

/**
 * Save a completed goal + its action steps to memory.
 */
export function saveGoal(goal, steps, success = true) {
    const memory = loadMemory();

    // Avoid duplicates — update if same goal exists
    const existing = memory.goals.findIndex(g =>
        normalize(g.goal) === normalize(goal)
    );

    const entry = {
        goal,
        steps,
        success,
        timestamp: new Date().toISOString(),
        useCount: 1
    };

    if (existing !== -1) {
        entry.useCount = (memory.goals[existing].useCount || 1) + 1;
        memory.goals[existing] = entry;
    } else {
        memory.goals.push(entry);
    }

    // Keep last 50 goals max
    if (memory.goals.length > 50) {
        memory.goals = memory.goals.slice(-50);
    }

    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

/**
 * Fuzzy-match a goal against memory. Returns the best matching entry or null.
 */
export function recallGoal(goal) {
    const memory = loadMemory();
    if (!memory.goals.length) return null;

    const normalizedGoal = normalize(goal);

    // Exact match first
    const exact = memory.goals.find(g =>
        normalize(g.goal) === normalizedGoal && g.success
    );
    if (exact) return exact;

    // Substring match
    const partial = memory.goals.find(g =>
        g.success && (
            normalize(g.goal).includes(normalizedGoal) ||
            normalizedGoal.includes(normalize(g.goal))
        )
    );
    if (partial) return partial;

    // Word overlap match (>60% words in common)
    const goalWords = normalizedGoal.split(/\s+/);
    let bestMatch = null;
    let bestScore = 0;

    for (const entry of memory.goals) {
        if (!entry.success) continue;
        const entryWords = normalize(entry.goal).split(/\s+/);
        const common = goalWords.filter(w => entryWords.includes(w)).length;
        const score = common / Math.max(goalWords.length, entryWords.length);
        if (score > 0.6 && score > bestScore) {
            bestScore = score;
            bestMatch = entry;
        }
    }

    return bestMatch;
}

/**
 * Build a memory context string for the prompt.
 */
export function buildMemoryContext(goal) {
    const recalled = recallGoal(goal);
    if (!recalled) return "";

    const stepsStr = recalled.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n');
    return `MEMORY (from a previous successful run of "${recalled.goal}"):\n${stepsStr}\nUse this as a guide but adapt to the current screen state.`;
}

function normalize(str) {
    return str.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
}
