import React from "react";

export default function DesignSystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full select-text bg-[var(--cvl-void)]">
      {children}
    </div>
  );
}
