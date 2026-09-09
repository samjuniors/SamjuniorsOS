import { NextRequest, NextResponse } from 'next/server';
import { CommunicationRuntime } from '@/lib/server/communication/runtime';
import { ContactVerificationState } from '@/types/communication';
import { getAuthenticatedFounder } from '@/lib/server/auth/session';

/**
 * GET /api/communication/contacts
 * Minimal inspection API for contacts.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAuthenticatedFounder(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') || undefined;
    const organizationId = searchParams.get('organizationId') || undefined;
    const verificationState = (searchParams.get('verificationState') as ContactVerificationState) || undefined;

    const runtime = CommunicationRuntime.getInstance();
    const contacts = await runtime.listContacts({
      query,
      organizationId,
      verificationState,
    });

    return NextResponse.json({
      success: true,
      count: contacts.length,
      contacts,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/communication/contacts
 * Registers a new contact via Communication Runtime.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedFounder(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const body = await req.json();
    const { name, email, organizationId, organizationName, role, title, verificationState, requestedBy } = body;

    if (!name || !email) {
      return NextResponse.json({ success: false, error: 'Name and email are required.' }, { status: 400 });
    }

    const runtime = CommunicationRuntime.getInstance();
    const contact = await runtime.createContact({
      name,
      email,
      organizationId,
      organizationName,
      role,
      title,
      verificationState,
      requestedBy,
    });

    return NextResponse.json({ success: true, contact });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
}
