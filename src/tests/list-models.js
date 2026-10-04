
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    console.log(`Querying: ${url.replace(key, 'HIDDEN')}`);

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("API Error:", JSON.stringify(data.error, null, 2));
            fs.writeFileSync('models.txt', "ERROR: " + JSON.stringify(data.error));
        } else if (data.models) {
            console.log("Success! Writing to models.txt");
            const lines = data.models.map(m => `${m.name} | ${m.supportedGenerationMethods.join(',')}`).join('\n');
            fs.writeFileSync('models.txt', lines);
        } else {
            console.log("No models returned.");
            fs.writeFileSync('models.txt', "NO MODELS");
        }
    } catch (err) {
        console.error("Fetch failed:", err);
        fs.writeFileSync('models.txt', "FETCH FAILED: " + err.message);
    }
}

listModels();
