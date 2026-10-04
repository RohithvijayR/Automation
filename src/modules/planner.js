
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { buildMemoryContext } from './memory.js';

dotenv.config();

const PROVIDER = (process.env.PROVIDER || 'gemini').toLowerCase();

// Initialize both providers
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Generate a high-level plan for a goal.
 * Returns: { plan: ["Step 1", "Step 2", ...], total: N }
 */
export async function generatePlan(goal) {
    const memoryContext = buildMemoryContext(goal);

    const IS_WIN = process.platform === 'win32';
    const osName = IS_WIN ? 'Windows' : 'macOS';

    const prompt = [
        `You are a ${osName} desktop automation planner. Given a user goal, create a SHORT high-level plan.`,
        "",
        `GOAL: "${goal}"`,
        "",
        memoryContext || "(No memory of this task)",
        "",
        "Create a plan with 2-5 high-level steps. Each step should be one logical action.",
        "Example for 'open spotify and play a song':",
        '{ "plan": ["Open Spotify app", "Search for the song", "Click play"], "total": 3 }',
        "",
        "Return ONLY valid JSON. No markdown. No explanation.",
        '{ "plan": ["step1", "step2"], "total": N }'
    ].join('\n');

    try {
        let text = '';

        if (PROVIDER === 'both') {
            const result = await Promise.any([
                planWithGroq(prompt),
                planWithGemini(prompt)
            ]);
            text = result;
        } else if (PROVIDER === 'groq') {
            try { text = await planWithGroq(prompt); }
            catch { text = await planWithGemini(prompt); }
        } else {
            try { text = await planWithGemini(prompt); }
            catch { text = await planWithGroq(prompt); }
        }

        return parsePlan(text);
    } catch (err) {
        console.warn("⚠️ Planning failed, proceeding without plan:", err.message);
        return null;
    }
}

async function planWithGemini(prompt) {
    const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-3.6-flash"];
    let lastErr = null;

    for (const modelName of modelsToTry) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent([prompt]);
            const response = await result.response;
            return response.text();
        } catch (err) {
            lastErr = err;
            if (err.message && (err.message.includes('503') || err.message.includes('404') || err.message.includes('capacity') || err.message.includes('UNAVAILABLE'))) {
                console.warn(`⚠️ Gemini planner model ${modelName} 503/capacity limit. Retrying with fallback model...`);
                continue;
            }
            throw err;
        }
    }
    throw lastErr;
}

async function planWithGroq(prompt) {
    const response = await groqClient.chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 512,
    });
    return response.choices[0]?.message?.content || '';
}

function parsePlan(text) {
    let jsonStr = text.trim();
    jsonStr = jsonStr.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();

    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) return null;

    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);

    try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.plan && Array.isArray(parsed.plan)) {
            return parsed;
        }
        return null;
    } catch {
        try {
            return new Function("return " + jsonStr)();
        } catch {
            return null;
        }
    }
}
