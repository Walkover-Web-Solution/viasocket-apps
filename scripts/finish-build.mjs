// The package root declares no "type", so Node treats plain .js as CommonJS. The ESM build
// needs its own package.json saying otherwise, and the CJS build gets one too so a future
// root-level change can never flip it by accident.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

for (const [dir, type] of [
  ['dist/esm', 'module'],
  ['dist/cjs', 'commonjs']
]) {
  mkdirSync(join(root, dir), { recursive: true })
  writeFileSync(join(root, dir, 'package.json'), JSON.stringify({ type }, null, 2) + '\n')
}
