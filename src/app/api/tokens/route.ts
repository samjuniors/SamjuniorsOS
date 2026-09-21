import { NextResponse } from "next/server";
import { fallbackTokens, stateAccent, stateLabel, stateCaption } from "@/lib/tokens";

export const dynamic = "force-static";

export async function GET() {
  const tokens = fallbackTokens.map((t, idx) => ({
    id: idx + 1,
    ...t,
  }));

  return NextResponse.json({
    tokens,
    states: {
      accent: stateAccent,
      label: stateLabel,
      caption: stateCaption,
    },
    version: "1.0.0",
    system: "Canonical Visual Language",
  });
}
