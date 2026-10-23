'use client';

import React from 'react';
import SofiaVoiceCompanion from '@/components/SofiaVoiceCompanion';

export default function App({ active = true }: { active?: boolean }) {
  return (
    <div className="relative w-full h-full">
      <SofiaVoiceCompanion active={active} />
    </div>
  );
}
