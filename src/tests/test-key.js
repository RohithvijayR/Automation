
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

async function run() {
    console.log("Testing API Key with gemini-pro (text only)...");
    try {
        const result = await model.generateContent("Hello");
        const response = await result.response;
        console.log("Response:", response.text());
        console.log("SUCCESS: Key is valid.");
    } catch (err) {
        console.error("FAILED:", err.message);
    }
}

run();
