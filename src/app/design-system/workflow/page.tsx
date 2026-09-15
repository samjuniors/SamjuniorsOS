import {
  Commit,
  EmptyStates,
  Entities,
  Foundations,
  Hero,
  Perimeter,
  Relationships,
  Sequence,
  Surfaces,
  CanvasSection,
} from "@/components/sections";
import { Section } from "@/components/primitives";
import { TokenTable, type TokenRow } from "@/components/token-table";
import { WorkflowSection } from "@/components/workflow-section";
import { fallbackTokens } from "@/lib/tokens";

export const dynamic = "force-static";

function loadSpecimenTokens(): { rows: TokenRow[]; source: string } {
  return {
    rows: fallbackTokens.map((t, i) => ({ id: i + 1, ...t })),
    source: "static canonical tokens",
  };
}

export default function CanonicalDesignSystemPage() {
  const { rows, source } = loadSpecimenTokens();
  return (
    <main className="cvl-grid min-h-screen px-4 py-10 sm:px-8 select-text text-[var(--cvl-text)] bg-[var(--cvl-void)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <Hero />
        <Foundations />
        <Entities />
        <Perimeter />
        <Relationships />
        <Sequence />
        <CanvasSection />
        <Surfaces />
        <Commit />
        <EmptyStates />
        <WorkflowSection />
        <Section
          index="12"
          kicker="contract & tokens"
          title="Derived Contract Audit & Copyable Token Snippets"
          blurb="Specimen instrumentation values derived from the canonical token set. Apply computed-first, copyable CSS outputs for the surfaces above."
        >
          <TokenTable rows={rows} source={source} />
        </Section>
        <footer className="cvl-label flex items-center justify-between py-8">
          <span>canonical visual language · v1.0</span>
          <span>◇ canvasworks · samjuniorsos</span>
        </footer>
      </div>
    </main>
  );
}
