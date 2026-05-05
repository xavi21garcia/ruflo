#!/usr/bin/env node
/**
 * @claude-flow/cli-core entry point.
 *
 * Status: alpha skeleton (ADR-100). Real source files are moved in here
 * during follow-up fires. This entry stub exists so the package's
 * publish surface (`bin: claude-flow-core`) is non-empty on first
 * publish, and so plugins testing against the alpha can resolve the
 * canonical export path.
 *
 * The full surface (memory commands + hooks commands + their MCP tool
 * definitions) lands incrementally — see ADR-100 §"Plan of work" for
 * the order. Until the move completes, this binary is a no-op that
 * prints a "skeleton" notice and exits 0.
 */

import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);

if (args[0] === '--version' || args[0] === '-v') {
  // Read from package.json so the version stays in lockstep
  const url = new URL('../../package.json', import.meta.url);
  const fs = await import('node:fs/promises');
  const pkg = JSON.parse(await fs.readFile(fileURLToPath(url), 'utf-8'));
  console.log(pkg.version);
  process.exit(0);
}

if (args[0] === '--help' || args[0] === '-h' || args.length === 0) {
  console.log(`@claude-flow/cli-core (alpha skeleton — ADR-100)

This is the lite core surface of @claude-flow/cli — memory + hooks only.
Real commands ship in subsequent alpha releases. Track progress at:
  https://github.com/ruvnet/ruflo/issues — search "ADR-100"

Until then, the full CLI is at:  npx @claude-flow/cli@alpha <command>`);
  process.exit(0);
}

console.error(`@claude-flow/cli-core: command "${args[0]}" not yet wired into the alpha skeleton.
For now, use the full CLI:  npx @claude-flow/cli@alpha ${args.join(' ')}
`);
process.exit(1);
