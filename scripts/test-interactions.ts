import { GoogleGenAI } from '@google/genai';

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const interaction = await ai.interactions.create({
      model: "gemini-3.8-flash",
      input: "What is the latest news about NASA today?",
      tools: [{ type: 'google_search' }],
    });
    console.log(interaction.output_text);
    console.log(JSON.stringify(interaction.steps.filter(s => s.type.includes('search')), null, 2));
  } catch (e) {
    console.error(e);
  }
}
run();
