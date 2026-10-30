import { NextRequest, NextResponse } from '@/lib/server/http';
import { BriefingSettingsStore } from '@/lib/server/sophia/briefing';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = BriefingSettingsStore.getInstance().getSettings();
    return NextResponse.json({ success: true, settings });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to retrieve briefing settings' },
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

export async function PUT(req: NextRequest) {
  return POST(req);
}
