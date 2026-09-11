'use client';

import V2Design1 from '@/Uploaded/Design1/src/App';

/**
 * The root route intentionally serves only the V2 Design1 operating surface.
 * Cockpit and classic-desktop code remains in the repository as inactive
 * reference material and is not imported from an active route.
 */
export default function SamJuniorsOSPage() {
  return <V2Design1 />;
}
