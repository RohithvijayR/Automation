
import { captureScreen, analyzeScreen, resetScreenDiff } from './modules/vision.js';
import * as control from './modules/control.js';
import * as logger  from './modules/logger.js';
import { generatePlan }          from './modules/planner.js';
import { saveGoal, buildMemoryContext } from './modules/memory.js';
import { checkAction, getSafeMode }     from './modules/security.js';
import { parseIntent, intentToContext } from './brain/intent_parser.js';
import { WorkingMemory }                from './brain/working_memory.js';
import { reflect }                      from './brain/self_reflection.js';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

function ask(rl, question) {
    return new Promise(resolve => rl.question(question, resolve));
}

// ─── action executor ─────────────────────────────────────────────────────────

async function executeAction(action) {
    if (action.action === 'wait') {
        await new Promise(r => setTimeout(r, action.duration || 600));
        return { status: 'success' };
    }

    const handlers = {
        click:           () => control.click(action.x, action.y),
        double_click:    () => control.doubleClick(action.x, action.y),
        right_click:     () => control.rightClick(action.x, action.y),
        move:            () => control.move(action.x, action.y),
        scroll:          () => control.scroll(action.amount),
        type:            () => control.type(action.text),
        press:           () => control.press(action.key),
        hotkey:          () => control.hotkey(action.keys),
        draw:            () => control.draw(action.path),
        ui_click:        () => control.uiClick(action.label),
        ui_click_partial:() => control.uiClickPartial(action.label),
        ui_click_input:  () => control.uiClickInput(action.label),
        list_elements:   () => control.listElements(),
        clipboard_get:   () => control.getClipboard(),
        clipboard_set:   () => control.setClipboard(action.text),
        shell:           () => control.runShell(action.cmd),
        spotify_play:    () => control.spotifyPlay(),
        applescript:     () => control.applescript(action.script),
    };

    const handler = handlers[action.action];
    if (!handler) return { status: 'error', message: `Unknown action: ${action.action}` };
    return await handler();
}

function actionLabel(action) {
    if (action.action === 'hotkey')           return `[${action.keys?.join('+')}]`;
    if (action.action === 'ui_click')         return `"${action.label}"`;
    if (action.action === 'ui_click_partial') return `~"${action.label}"`;
    if (action.action === 'ui_click_input')   return `"${action.label || '(first input)'}"`;
    if (action.action === 'type')             return `"${action.text}"`;
    if (action.action === 'press')            return action.key;
    if (action.action === 'shell')            return `$ ${action.cmd}`;
    if (action.action === 'applescript')      return `script: "${action.script}"`;
    if (action.x != null)                     return `(${action.x},${action.y})`;
    return '';
}

// ─── main ────────────────────────────────────────────────────────────────────

async function run() {
    console.log("☄️  Meteorid V6 — Autonomous AI Desktop Agent");
    console.log(`📝 Logs: ${logger.getLogFilePath()}`);
    console.log(`🔒 Safe Mode: ${getSafeMode().toUpperCase()}`);
    console.log("Type 'exit' to quit.\n");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    let resolution = { width: 1920, height: 1080 };
    try {
        const res = await control.sendCommand({ action: 'get_resolution' });
        if (res.status === 'success') {
            resolution = { width: res.width, height: res.height };
            console.log(`🖥️  Screen: ${resolution.width}x${resolution.height}`);
        }
    } catch { console.warn("Using default 1920x1080"); }

    try {
        while (true) {
            const goal = await ask(rl, "\n🎯 Goal > ");
            if (goal.trim().toLowerCase() === 'exit') break;
            if (!goal.trim()) continue;

            logger.log('GOAL', goal);

            // ── 1. Intent parsing ─────────────────────────────────────────
            const intentResult  = parseIntent(goal);
            const intentCtx     = intentToContext(intentResult);
            console.log(`🔍 Intent: ${intentResult.intent}${intentResult.app ? ` | App: ${intentResult.app}` : ''}${intentResult.query ? ` | Query: "${intentResult.query}"` : ''}`);

            // ── 2. Long-term memory recall ────────────────────────────────
            const memoryCtx = buildMemoryContext(goal);
            if (memoryCtx) console.log("🧠 Memory: Found a similar past goal!");

            // ── 3. Planning ───────────────────────────────────────────────
            console.log("📋 Planning...");
            const plan = await generatePlan(goal);
            let planContext = '';
            let planStepIdx = 0;
            if (plan?.plan?.length) {
                console.log("📋 Plan:");
                plan.plan.forEach((s, i) => console.log(`   ${i + 1}. ${s}`));
            }

            // ── 4. Working memory ─────────────────────────────────────────
            const wm = new WorkingMemory(goal, intentResult);

            // ── 5. Execution loop ─────────────────────────────────────────
            let status       = 'CONTINUE';
            let stepCount    = 0;
            let noChangeCount= 0;
            const MAX_STEPS  = 25;

            while (status !== 'DONE' && status !== 'FAIL' && stepCount < MAX_STEPS) {
                stepCount++;

                if (plan?.plan?.length) {
                    const idx = Math.min(planStepIdx, plan.plan.length - 1);
                    planContext = `Step ${idx + 1}/${plan.total} — ${plan.plan[idx]}`;
                }

                console.log(`\n─── Step ${stepCount} ${planContext ? `(${planContext})` : ''} ───`);
                console.log("👀 Capturing screen...");

                const screenshot = await captureScreen();
                const result = await analyzeScreen(
                    screenshot, goal, wm.toHistoryArray(), resolution,
                    wm.toPromptContext(), planContext, intentCtx, memoryCtx
                );

                if (!result) {
                    console.log("❌ No response from AI. Retrying...");
                    continue;
                }

                if (result.noChange) {
                    noChangeCount++;
                    if (noChangeCount >= 3) {
                        wm.recordAction({ action: 'SYSTEM' }, false, 'Screen stuck — force new strategy');
                        console.log("⚠️  Screen stuck for 3 steps — forcing retries with fresh state");
                        noChangeCount = 0;
                        resetScreenDiff();
                    }
                    await new Promise(r => setTimeout(r, 400));
                    continue;
                }
                noChangeCount = 0;

                wm.setThought(result.thought);
                console.log(`🧠 ${result.thought}`);
                status = result.status;

                if (status === 'FAIL') {
                    console.log("❌ Agent gave up.");
                    logger.log('FAIL', result.thought);
                    break;
                }

                // ── Execute actions ───────────────────────────────────────
                const batchActions = result.actions || [];
                for (const action of batchActions) {
                    // Security gate
                    const sec = checkAction(action);
                    if (!sec.allowed) {
                        console.log(`🔒 BLOCKED: ${sec.reason}`);
                        logger.log('SECURITY', sec.reason);
                        status = 'FAIL';
                        break;
                    }
                    if (sec.testOverride) {
                        console.log(`⚠️  TEST OVERRIDE: ${sec.reason}`);
                    }

                    // Guard: skip malformed/undefined actions
                    if (!action || !action.action) {
                        console.log(`⚠️  Skipping malformed action: ${JSON.stringify(action)}`);
                        continue;
                    }

                    // Utility actions (hotkey, press, wait, scroll, move) are NEVER stuck.
                    // Only track goal actions for loop detection.
                    const GOAL_ACTIONS = new Set(['type','ui_click','ui_click_partial','ui_click_input','click','double_click','right_click','shell','spotify_play','applescript']);
                    const isGoalAction = GOAL_ACTIONS.has(action.action);

                    // Skip stuck/looping GOAL actions — they're not working
                    if (isGoalAction && wm.isStuck(action)) {
                        const lbl2 = actionLabel(action);
                        console.log(`🔄 LOOP DETECTED — skipping repeated "${action.action} ${lbl2}". AI must choose different action.`);
                        wm.recordAction(action, false, 'SKIPPED: same action repeated — not working');
                        continue;
                    }

                    const lbl = actionLabel(action);
                    console.log(`▶  ${action.action} ${lbl}`);
                    logger.log('ACTION', `${action.action} ${lbl}`, action);

                    let success = true;
                    let note    = '';
                    try {
                        const res = await executeAction(action);
                        if (res?.status === 'error') {
                            console.log(`⚠️  ${action.action} failed: ${res.message}`);
                            logger.log('ERROR', res.message);
                            success = false;
                            note = res.message;
                        } else if (res?.status === 'success' && res.message) {
                            console.log(`✅ ${res.message}`);
                        }
                        // Special handling for shell output
                        if (action.action === 'shell' && res?.stdout) {
                            console.log(`📄 Shell: ${res.stdout.slice(0, 200)}`);
                        }
                        // Store clipboard reads in working memory
                        if (action.action === 'clipboard_get' && res?.text) {
                            wm.clipboardText = res.text;
                        }
                    } catch (err) {
                        console.log(`⚠️  Action error: ${err.message}`);
                        logger.log('ERROR', err.message);
                        success = false;
                        note = err.message;
                    }

                    wm.recordAction(action, success, note);
                }

                // ── Emergency rescue: if ALL actions were skipped, nothing ran ──────
                const allSkipped = batchActions.length > 0 &&
                    batchActions.every(a => {
                        const key = `${a.action}:${a.label || a.text || a.key || ''}`;
                        return (wm.failedActions[key] || 0) >= 2 || (wm.repeatedActions[key] || 0) >= 2;
                    });

                if (allSkipped) {
                    console.log("🚨 Emergency rescue — all actions stuck. Resetting...");
                    logger.log('RESCUE', 'All actions stuck, firing rescue sequence');

                    await control.press('escape');
                    await new Promise(r => setTimeout(r, 300));

                    const appToOpen = wm.intent?.app || null;
                    const webApps = {
                        youtube: 'https://www.youtube.com',
                        gmail:   'https://mail.google.com',
                        google:  'https://www.google.com',
                        twitter: 'https://www.twitter.com',
                        reddit:  'https://www.reddit.com',
                        github:  'https://www.github.com',
                    };

                    const IS_WIN = process.platform === 'win32';
                    if (appToOpen && webApps[appToOpen]) {
                        // Web app: navigate via address bar
                        const url = webApps[appToOpen];
                        console.log(`🌐 Rescue: navigating to ${url}...`);
                        await control.hotkey(IS_WIN ? ['ctrl', 'l'] : ['command', 'l']);
                        await new Promise(r => setTimeout(r, 400));
                        await control.type(url);
                        await control.press('enter');
                        console.log(`✅ Rescue: navigated to ${url}`);
                    } else if (appToOpen) {
                        // Native app
                        if (IS_WIN) {
                            console.log(`🚀 Rescue: launching "${appToOpen}" via win+r...`);
                            await control.hotkey(['win', 'r']);
                            await new Promise(r => setTimeout(r, 500));
                            await control.type(appToOpen);
                            await control.press('enter');
                        } else {
                            console.log(`🚀 Rescue: launching "${appToOpen}" via open -a...`);
                            await control.runShell(`open -a "${appToOpen}"`);
                        }
                        console.log(`✅ Rescue: launched ${appToOpen}`);
                    }

                    wm.failedActions   = {};
                    wm.repeatedActions = {};
                    wm.lastActionKey   = null;
                    wm.consecutiveFails = 0;
                }


                // Reset diff after executing actions
                if (batchActions.length > 0) {
                    resetScreenDiff();
                }


                // ── Self-reflection ───────────────────────────────────────
                if (batchActions.length > 0 && status === 'CONTINUE') {
                    try {
                        const recentScreen = await captureScreen();
                        const reflection = await reflect(
                            goal,
                            wm.toHistoryArray().slice(-3),
                            recentScreen
                        );
                        if (!reflection.success) {
                            console.log(`🔄 Reflection: ${reflection.observation}`);
                            if (reflection.suggestion) {
                                console.log(`💡 Suggestion: ${reflection.suggestion}`);
                                wm.recordAction({ action: 'REFLECTION' }, false, reflection.suggestion);
                            }
                            resetScreenDiff(); // force fresh analysis
                        }
                    } catch { /* reflection is best-effort */ }
                }

                await new Promise(r => setTimeout(r, 300));

                if (status === 'DONE') {
                    // Guard: if the last batch had any failures, the AI is over-optimistic.
                    // Force another step to visually verify instead of declaring done.
                    const lastFailed = wm.stepResults.slice(-batchActions.length)
                        .some(r => !r.success);
                    if (lastFailed && batchActions.length > 0) {
                        console.log("⚠️  DONE claimed but last batch had failures — verifying...");
                        status = 'CONTINUE';
                        resetScreenDiff();
                    } else {
                        console.log(`\n✅ Goal accomplished!`);
                        if (result.thought) console.log(`💬 ${result.thought}`);
                        logger.log('SUCCESS', 'Goal accomplished');
                        saveGoal(goal, wm.toHistoryArray(), true);
                        console.log("💾 Saved to memory.");
                        break;
                    }
                }

            }

            if (stepCount >= MAX_STEPS) {
                console.log("⚠️  Max steps reached.");
                saveGoal(goal, wm.toHistoryArray(), false);
            }
        }
    } catch (e) {
        console.error("Critical Error:", e);
        logger.log('FATAL', e.message);
    } finally {
        rl.close();
    }
}

run().catch(console.error);
