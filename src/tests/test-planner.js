import { generatePlan } from '../modules/planner.js';
import dotenv from 'dotenv';

dotenv.config();

async function testPlanner() {
    console.log("🧪 Testing Planner Module...");
    const goal = "open spotify and play a song";
    console.log(`🎯 Goal: "${goal}"`);

    console.log("⏳ Generating plan...");
    const plan = await generatePlan(goal);

    if (plan) {
        console.log("\n✅ Plan Generated Successfully:");
        console.log(JSON.stringify(plan, null, 2));
    } else {
        console.log("\n❌ Failed to generate plan.");
    }
}

testPlanner().catch(console.error);
