#!/usr/bin/env node
/**
 * Standalone companion runner for Sophia Live Interaction WebSocket gateway.
 * Listens on port 3001 (or LIVE_WS_PORT) alongside the Next.js application.
 */
import { LiveInteractionServer } from '../src/lib/server/live/server';

const port = parseInt(process.env.LIVE_WS_PORT || '3001', 10);
const server = new LiveInteractionServer({ port });

async function main() {
  const actualPort = await server.listen(port);
  console.log(`[Sophia Live Gateway] Companion WebSocket listening on ws://localhost:${actualPort}`);

  const shutdown = async (signal: string) => {
    console.log(`\n[Sophia Live Gateway] Received ${signal}. Closing gracefully...`);
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[Sophia Live Gateway] Failed to start:', err);
  process.exit(1);
});
