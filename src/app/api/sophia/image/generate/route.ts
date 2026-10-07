/**
 * POST /api/sophia/image/generate — SofiaUI's visual creation seam.
 * Body: {prompt, aspectRatio} → {url, prompt, aspectRatio, source}
 * (SofiaUI's image-gen contract), delegated to this repo's neural image
 * generator (the same one the legacy SOFIA routes used).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';
import { generateAiImage } from '@/lib/server/tools/image-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ASPECT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
};

export async function POST(req: NextRequest) {
  const founder = await getAuthenticatedFounder(req);
  if (!founder || founder.role !== 'FOUNDER') {
    return NextResponse.json({ error: 'Founder session required' }, { status: 401 });
  }
  try {
    const b = (await req.json()) as { prompt?: string; aspectRatio?: string };
    if (!b.prompt?.trim()) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }
    const aspectRatio = b.aspectRatio || '1:1';
    const dims = ASPECT_DIMENSIONS[aspectRatio] || ASPECT_DIMENSIONS['1:1'];
    const img = await generateAiImage(b.prompt, dims.width, dims.height);
    return NextResponse.json({
      url: img.imageUrl,
      prompt: img.prompt,
      aspectRatio,
      source: img.provider,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to generate image' }, { status: 500 });
  }
}
