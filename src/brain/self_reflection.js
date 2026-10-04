
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const PROVIDER = (process.env.PROVIDER || 'gemini').toLowerCase();
const genAI      = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
const groqClient  = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Self-Reflection — after an action batch, ask the AI:
 * "Did what I just did actually work toward the goal?"
 *
 * Returns: { success: bool, observation: string, suggestion?: string }
 */
export async function reflect(goal, lastActions, screenshotBuffer) {
    if (!screenshotBuffer || !lastActions || lastActions.length === 0) {
        return { success: true, observation: 'No actions to reflect on.' };
    }

    const actionsStr = lastActions.join(', ');
    const IS_WIN = process.platform === 'win32';
    const prompt = [
        `You are a ${IS_WIN ? 'Windows' : 'macOS'} automation verifier.`,
        `GOAL: "${goal}"`,
        `LAST ACTIONS TAKEN: ${actionsStr}`,
        '',
        'Look at the current screenshot.',
        'Answer: did the last actions make progress toward the goal?',
        '',
        'Return ONLY valid JSON:',
        '{ "success": true/false, "observation": "what you see", "suggestion": "what to try instead if failed" }',
        'No markdown. No extra text.'
    ].join('\n');

    try {
        const text = await callAI(prompt, screenshotBuffer);
        return parseReflection(text);
    } catch (err) {
        // Reflection is best-effort — don't crash the agent if it fails
        return { success: true, observation: `Reflection failed: ${err.message}` };
    }
}

async function callAI(prompt, imageBuffer) {
    const base64 = imageBuffer.toString('base64');

    if (PROVIDER === 'gemini' || PROVIDER === 'both') {
        const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-3.6-flash"];
        for (const modelName of modelsToTry) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent([
                    prompt,
                    { inlineData: { data: base64, mimeType: 'image/jpeg' } }
                ]);
                return (await result.response).text();
            } catch (err) {
                if (err.message && (err.message.includes('503') || err.message.includes('404') || err.message.includes('capacity') || err.message.includes('UNAVAILABLE'))) {
                    continue;
                }
            }
        }
    }

    // Groq fallback
    const resp = await groqClient.chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
            ]
        }],
        temperature: 0.1,
        max_tokens: 256,
    });
    return resp.choices[0]?.message?.content || '';
}

function parseReflection(text) {
    try {
        const clean = text.replace(/```json|```/g, '').trim();
        const i = clean.indexOf('{');
        const j = clean.lastIndexOf('}');
        if (i === -1 || j === -1) return { success: true, observation: text };
        return JSON.parse(clean.slice(i, j + 1));
    } catch {
        return { success: true, observation: text };
    }
}
