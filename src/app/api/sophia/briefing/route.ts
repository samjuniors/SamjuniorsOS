import { NextRequest, NextResponse } from '@/lib/server/http';
import { getProactiveBriefing, BriefingSettingsStore } from '@/lib/server/sophia/briefing';
import { ProactiveBriefingOptions } from '@/types/briefing';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const sinceParam = url.searchParams.get('since') || undefined;
    const channelParam = (url.searchParams.get('channel') as any) || 'panel';
    const forceParam = url.searchParams.get('force') === 'true';
    const founderId = req.headers.get('x-founder-id') || url.searchParams.get('founderId') || 'founder';

    const opts: ProactiveBriefingOptions = {
      since: sinceParam,
      channel: channelParam,
      force: forceParam,
      founderId,
    };

    const result = await getProactiveBriefing(opts);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to generate proactive briefing' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const founderId = req.headers.get('x-founder-id') || 'founder';
    const settingsStore = BriefingSettingsStore.getInstance();

    const patch: any = {};
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (typeof body.spokenOnOpen === 'boolean') patch.spokenOnOpen = body.spokenOnOpen;
    if (typeof body.includeDecisions === 'boolean') patch.includeDecisions = body.includeDecisions;
    if (typeof body.includeApprovals === 'boolean') patch.includeApprovals = body.includeApprovals;

    const updated = await settingsStore.updateSettings(patch, founderId);
    return NextResponse.json({ success: true, settings: updated });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to update briefing settings' },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  return POST(req);
}
