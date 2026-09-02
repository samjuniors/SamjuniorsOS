import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { SERVER_AGENTS } from "@/lib/server/agents/definitions";
import { AgentRole } from "@/types/os";

export async function POST(req: NextRequest) {
  try {
    const { agentId, message } = await req.json();

    if (!agentId || !message) {
      return NextResponse.json({ error: "Agent ID and message are required" }, { status: 400 });
    }

    const agentKey = (agentId in SERVER_AGENTS ? agentId : "coo") as AgentRole;
    const persona = SERVER_AGENTS[agentKey];
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const systemInstruction = `${persona.systemInstruction}
Respond directly to the Founder. Stay strictly within your domain and capabilities.
Prohibited actions:
${persona.prohibitedActions.map((p) => `- ${p}`).join("\n")}

Do not fabricate specific unverified metrics or imaginary revenue ledgers. State reasoning and domain insights directly.`;

      const candidateModels = ["gemini-3.7-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];

      for (const model of candidateModels) {
        try {
          const chat = ai.chats.create({
            model,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          });

          const response = await chat.sendMessage({
            message,
          });

          if (response.text) {
            return NextResponse.json({
              success: true,
              agentId: persona.id,
              name: persona.name,
              role: persona.role,
              reply: response.text,
              liveAi: true,
              modelUsed: model,
            });
          }
        } catch (err: any) {
          const isHighDemand =
            err?.status === 503 ||
            err?.code === 503 ||
            err?.message?.includes("high demand") ||
            err?.message?.includes("UNAVAILABLE") ||
            err?.message?.includes("RESOURCE_EXHAUSTED");
          if (isHighDemand) {
            continue;
          }
          break;
        }
      }
    }

    // Truthful fallback when GEMINI_API_KEY is not configured
    return NextResponse.json({
      success: true,
      agentId: persona.id,
      name: persona.name,
      role: persona.role,
      reply: `[${persona.name} - ${persona.role}] I have received your message regarding: "${message}". Live AI reasoning is currently awaiting a configured server GEMINI_API_KEY in Settings. In accordance with system truthfulness invariants, simulated responses with fabricated metrics are disabled.`,
      liveAi: false,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to chat with agent" }, { status: 500 });
  }
}
