import { readdirSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const out = resolve('.backfill/unit-tests')
mkdirSync(out, { recursive: true })
const names = readdirSync('tests')
const typescriptTests = names.filter(name => name.endsWith('.test.ts')).map(name => resolve('tests', name))
const compilation = spawnSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--outDir', out,
  '--module', 'commonjs', '--target', 'es2020', '--esModuleInterop', '--skipLibCheck', ...typescriptTests], { stdio: 'inherit' })
if (compilation.status !== 0) process.exit(compilation.status ?? 1)
const tests = typescriptTests.map(name => resolve(out, 'tests', name.split(/[\\/]/).pop().replace(/\.ts$/, '.js')))
tests.push(...names.filter(name => name.endsWith('.test.mjs')).map(name => resolve('tests', name)))
const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' })
process.exit(result.status ?? 1)
