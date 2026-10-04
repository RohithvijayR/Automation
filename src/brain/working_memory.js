
/**
 * Working Memory — tracks the current task state within a single goal session.
 */

export class WorkingMemory {
    constructor(goal, intentResult) {
        this.goal             = goal;
        this.intent           = intentResult;
        this.startTime        = Date.now();
        this.stepResults      = [];   // { step, action, success, note }
        this.failedActions    = {};   // action_key → fail count
        this.repeatedActions  = {};   // action_key → repeat count (catches silent loops)
        this.lastActionKey    = null;
        this.activeApp        = null;
        this.lastThought      = '';
        this.clipboardText    = '';
        this.consecutiveFails = 0;
    }

    /** These actions are pure utilities — never flag them as stuck */
    static UTILITY_ACTIONS = new Set(['hotkey','press','wait','scroll','move','draw']);

    /** Record the result of an executed action */
    recordAction(action, success, note = '') {
        const key = `${action.action}:${action.label || action.text || action.key || ''}`;

        // Track explicit failures
        if (!success) {
            this.failedActions[key] = (this.failedActions[key] || 0) + 1;
            this.consecutiveFails++;
        } else {
            this.consecutiveFails = 0;
        }

        // Only track repeats for GOAL actions — utility actions like hotkey/press
        // are legitimately used many times and should not trigger loop detection.
        if (!WorkingMemory.UTILITY_ACTIONS.has(action.action)) {
            if (key === this.lastActionKey) {
                this.repeatedActions[key] = (this.repeatedActions[key] || 1) + 1;
            } else {
                if (this.lastActionKey) this.repeatedActions[this.lastActionKey] = 0;
                this.repeatedActions[key] = 1;
            }
            this.lastActionKey = key;
        }

        this.stepResults.push({ step: this.stepResults.length + 1, action: key, success, note });
    }

    /** Set the last AI thought */
    setThought(thought) { this.lastThought = thought; }

    /**
     * Check if an action has failed OR been silently repeated too many times.
     * maxFails = explicit error threshold
     * maxRepeats = silent loop threshold (catches type/press loops)
     */
    isStuck(action, maxFails = 2, maxRepeats = 2) {
        const key = `${action.action}:${action.label || action.text || action.key || ''}`;
        const fails   = this.failedActions[key]   || 0;
        const repeats = this.repeatedActions[key] || 0;
        return fails >= maxFails || repeats >= maxRepeats;
    }

    /** History as string array (for prompt + memory saving) */
    toHistoryArray() {
        return this.stepResults.map(r =>
            `${r.action}${r.success ? '' : ' [FAILED]'}${r.note ? ` — ${r.note}` : ''}`
        );
    }

    /** Build context block for the AI prompt */
    toPromptContext() {
        const elapsed = Math.round((Date.now() - this.startTime) / 1000);

        const stuckFailed = Object.entries(this.failedActions)
            .filter(([, n]) => n >= 2).map(([k]) => k);
        const stuckLooped = Object.entries(this.repeatedActions)
            .filter(([, n]) => n >= 2).map(([k]) => k);
        const allStuck = [...new Set([...stuckFailed, ...stuckLooped])];

        const parts = [`WORKING_MEMORY:`];
        if (this.activeApp)    parts.push(`  Active app: ${this.activeApp}`);
        if (this.clipboardText) parts.push(`  Clipboard: "${this.clipboardText.slice(0, 80)}"`);
        if (allStuck.length > 0) {
            parts.push(`  ⛔ STUCK — these actions are looping/failing: ${allStuck.join(', ')}`);
            parts.push(`  ⛔ DO NOT repeat them. Try a completely different approach.`);
        }
        parts.push(`  Steps: ${this.stepResults.length} | Elapsed: ${elapsed}s`);
        if (this.consecutiveFails >= 2) {
            parts.push(`  ⚠️ ${this.consecutiveFails} consecutive failures — change strategy NOW`);
        }
        return parts.join('\n');
    }

    onSuccess() { this.consecutiveFails = 0; }
}
