/**
 * GET /api/sofia/file?path=… — serve local image files to the page.
 *
 * Generated art lands under public/sofia/art and is normally served by
 * Next.js as a plain static file; this endpoint exists for the paths the
 * model still speaks — a bare absolute path or a file:// URL — and for
 * anything else that used to ride the old bridge's /file.
 *
 * Images only, absolute paths only, and only under roots we expect things
 * to be written to (the art dir and the system temp dir). This endpoint
 * exists to show pictures, not to be a general file read for whatever the
 * model — or another page — asks for.
 */

import { realpath, stat, readFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { isAbsolute, join, sep } from 'node:path'
import { tmpdir } from 'node:os'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
}

const MAX_FILE_BYTES = 25 * 1024 * 1024

/** The roots /file may read from, realpath'd so the containment check
 *  compares like with like (symlinks resolved before judgement). */
const ROOTS = [join(process.cwd(), 'public', 'sofia', 'art'), realpathSyncSafe(tmpdir())]

function realpathSyncSafe(p: string): string {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

const withinRoots = (real: string) =>
  ROOTS.some((root) => real === root || real.startsWith(root + sep))

export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get('path') ?? ''
  // Resolve symlinks BEFORE judging anything. A name ending in .png can be a
  // link pointing at /etc/hosts, and checking the suffix the caller supplied
  // would wave that straight through.
  let real: string | null = null
  try {
    if (isAbsolute(asked)) real = await realpath(asked)
  } catch {
    real = null
  }
  const dot = real ? real.lastIndexOf('.') : -1
  const ext = dot === -1 ? '' : real!.slice(dot).toLowerCase()

  if (!real || !Object.hasOwn(IMAGE_TYPES, ext) || !withinRoots(real)) {
    return new Response('images only', { status: 400 })
  }
  try {
    const info = await stat(real)
    if (!info.isFile() || info.size > MAX_FILE_BYTES) {
      return new Response('too large', { status: 413 })
    }
    const body = await readFile(real)
    return new Response(new Uint8Array(body), {
      headers: {
        'content-type': IMAGE_TYPES[ext],
        'x-content-type-options': 'nosniff',
        'cache-control': 'public, max-age=3600',
      },
    })
  } catch {
    return new Response('not found', { status: 404 })
  }
}
