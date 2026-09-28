import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [installerArg, blockmapArg] = process.argv.slice(2);

if (!installerArg || !blockmapArg) {
  throw new Error('Usage: node scripts/create-blockmap.mjs <installer.exe> <installer.exe.blockmap>');
}

const require = createRequire(import.meta.url);
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap.js');
const result = await buildBlockMap(resolve(installerArg), 'gzip', resolve(blockmapArg));

console.log(`Created differential update map for ${result.size} installer bytes.`);
