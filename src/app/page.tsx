'use client';

import React from 'react';

/**
 * SamJuniorsOS — Core V4 Prototype preview host.
 *
 * The Core V4 prototype is a standalone static HTML/CSS/JS experience,
 * isolated from all production/backend code at `public/prototype/v4/`.
 * This page simply hosts it full-viewport at the root route so the
 * founder can preview it. No production code is imported or modified.
 */
export default function CoreV4PrototypeHost() {
  return (
    <iframe
      id="coreV4Frame"
      src="/prototype/v4/index.html"
      title="SamJuniorsOS Core V4 Prototype"
      className="fixed inset-0 h-screen w-screen border-0 bg-black"
      allow="clipboard-write"
    />
  );
}
