import { NextRequest, NextResponse } from "next/server";
import { CompanyBrain } from "@/lib/server/brain/company-brain";
import {
  CreateArtifactInputSchema,
  CreateArtifactVersionInputSchema,
  ArtifactApprovalLinkageSchema,
} from "@/types/artifact";
import { getAuthenticatedFounder } from "@/lib/server/auth/session";

/**
 * Gate G4.2: First-Class Versioned Artifact Model API
 * 
 * Supports:
 * - Listing artifacts with filters (kind, status, tag)
 * - Fetching single artifact by id or slug
 * - Fetching specific version of an artifact
 * - Creating a new versioned artifact
 * - Adding a version to an existing artifact
 * - Binding an authoritative founder approval to an artifact version
 */

export async function GET(req: NextRequest) {
  try {
    const founder = await getAuthenticatedFounder(req);
    if (!founder) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const idOrSlug = searchParams.get('id') || searchParams.get('slug');
    const versionParam = searchParams.get('version');
    const kind = searchParams.get('kind') || undefined;
    const status = (searchParams.get('status') as any) || undefined;
    const tag = searchParams.get('tag') || undefined;

    const brain = CompanyBrain.getInstance();

    if (idOrSlug) {
      if (versionParam) {
        const vNum = parseInt(versionParam, 10);
        if (isNaN(vNum) || vNum < 1) {
          return NextResponse.json({ success: false, error: 'Invalid version number' }, { status: 400 });
        }
        const version = await brain.getArtifactVersion(idOrSlug, vNum);
        if (!version) {
          return NextResponse.json({ success: false, error: 'Artifact version not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: version });
      }

      const artifact = await brain.getArtifact(idOrSlug);
      if (!artifact) {
        return NextResponse.json({ success: false, error: 'Artifact not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: artifact });
    }

    const artifacts = await brain.listArtifacts({ kind, status, tag });
    return NextResponse.json({ success: true, count: artifacts.length, data: artifacts });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const founder = await getAuthenticatedFounder(req);
    if (!founder) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action || 'create_artifact';
    const brain = CompanyBrain.getInstance();

    if (action === 'create_artifact') {
      const parsed = CreateArtifactInputSchema.safeParse(body.artifact || body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: 'Validation failed', details: parsed.error.format() },
          { status: 400 }
        );
      }

      const record = await brain.createArtifact(parsed.data);
      return NextResponse.json({ success: true, data: record }, { status: 201 });
    }

    if (action === 'add_version') {
      const idOrSlug = body.artifactId || body.slug || body.id;
      if (!idOrSlug) {
        return NextResponse.json({ success: false, error: 'Artifact ID or slug required' }, { status: 400 });
      }

      const parsed = CreateArtifactVersionInputSchema.safeParse(body.version || body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: 'Validation failed', details: parsed.error.format() },
          { status: 400 }
        );
      }

      const record = await brain.addArtifactVersion(idOrSlug, parsed.data);
      return NextResponse.json({ success: true, data: record });
    }

    if (action === 'bind_approval') {
      const idOrSlug = body.artifactId || body.slug || body.id;
      const version = body.version;
      if (!idOrSlug || typeof version !== 'number') {
        return NextResponse.json({ success: false, error: 'Artifact ID and version number required' }, { status: 400 });
      }

      const parsed = ArtifactApprovalLinkageSchema.safeParse(body.approval || body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: 'Validation failed', details: parsed.error.format() },
          { status: 400 }
        );
      }

      const record = await brain.bindArtifactApproval(idOrSlug, version, parsed.data);
      return NextResponse.json({ success: true, data: record });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
