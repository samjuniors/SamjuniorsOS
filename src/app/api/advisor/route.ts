import { NextRequest, NextResponse } from 'next/server';
import { FounderAdvisorService } from '@/lib/server/advisor/advisor-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { question, history, contextSnapshot, contextAttachment } = body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_QUESTION',
          message: 'A non-empty question string is required for Founder Intelligence.',
        },
        { status: 400 }
      );
    }

    const advisorService = new FounderAdvisorService();
    const result = await advisorService.query(question, {
      history: Array.isArray(history) ? history : undefined,
      clientContextSnapshot: contextSnapshot || undefined,
      contextAttachment: contextAttachment || undefined,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('Advisor API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: error?.message || 'Failed to process Founder Intelligence query.',
      },
      { status: 500 }
    );
  }
}
