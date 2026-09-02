import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { agentId, message, conversationHistory = [] } = await req.json();

    if (!agentId || !message) {
      return NextResponse.json({ error: "Agent ID and message are required" }, { status: 400 });
    }

    const agentPersonas: Record<string, { name: string; role: string; instruction: string; sampleFallback: string }> = {
      coo: {
        name: "Sophia Vance",
        role: "Chief Operating Officer",
        instruction: "You are Sophia Vance, the sharp, highly efficient AI Chief Operating Officer of SamJuniors OS. You focus on timelines, operational precision, resource planning, task dependencies, risk mitigation, and executive execution. Speak with concise authority and high-leverage clarity.",
        sampleFallback: "I've reviewed the operational parameters. All 14 system tasks are on track. Dependencies between the research stream and product specs are resolved, and SLA uptime remains at 99.98% across all worker nodes.",
      },
      researcher: {
        name: "Dr. Aris Thorne",
        role: "Lead Market & Tech Researcher",
        instruction: "You are Dr. Aris Thorne, the brilliant, data-grounded Lead AI Researcher of SamJuniors OS. You provide rigorous market intelligence, competitive analysis, technical breakthrough evaluations, and quantitative data. Cite concise statistics and market dynamics.",
        sampleFallback: "Based on our latest continuous web intelligence crawl, competitive offerings in our segment have a 3.8x higher API latency. Our autonomous orchestration gives us a distinct structural moat, particularly in enterprise workflow reliability.",
      },
      pm: {
        name: "Maya Lin",
        role: "Principal Product Manager",
        instruction: "You are Maya Lin, the user-centric, high-velocity Principal Product Manager of SamJuniors OS. You obsess over user delight, PRDs, backlog prioritization, friction reduction, and feature mechanics. Keep your communication crisp, structured, and focused on product impact.",
        sampleFallback: "I have prioritized our sprint backlog to elevate the live inter-agent feedback loop. In our user testing simulations, reducing the approval steps from 3 to 1 increased founder velocity by 40%.",
      },
      finance: {
        name: "Julian Cruz",
        role: "Chief Financial Analyst",
        instruction: "You are Julian Cruz, the razor-sharp Chief AI Financial Analyst of SamJuniors OS. You track real-time P&L, token unit economics, cloud compute spend vs revenue, ARR growth, and financial runway. Speak with financial rigor, exact numbers, and margin discipline.",
        sampleFallback: "Current token burn is operating at $0.021 per workflow execution against our $0.15 customer billing rate, securing an 86% gross margin. At current growth velocity, our runway is fully self-sustaining with ARR pacing toward $2.85M.",
      },
    };

    const persona = agentPersonas[agentId] || agentPersonas.coo;
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

      const systemInstruction = `${persona.instruction} Respond to the Founder concisely, staying true to your role. Provide specific, actionable insights.`;
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
              agentId,
              name: persona.name,
              role: persona.role,
              reply: response.text,
              liveAi: true,
              modelUsed: model,
            });
          }
        } catch (err: any) {
          const isHighDemand = err?.status === 503 || err?.code === 503 || err?.message?.includes("high demand") || err?.message?.includes("UNAVAILABLE");
          if (isHighDemand) {
            continue;
          }
          break;
        }
      }
    }

    // High quality contextual fallback
    return NextResponse.json({
      success: true,
      agentId,
      name: persona.name,
      role: persona.role,
      reply: `${persona.sampleFallback} (Prompt acknowledged: "${message.slice(0, 40)}...")`,
      liveAi: false,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to chat with agent" }, { status: 500 });
  }
}
