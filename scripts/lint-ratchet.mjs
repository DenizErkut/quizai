// Kullanım:
//   node scripts/lint-ratchet.mjs <taban-dal>   değişen dosyaları denetler (CI), ör. origin/main
//   node scripts/lint-ratchet.mjs --update      tüm depoyu tarayıp .eslint-baseline.json dosyasını yeniden yazar
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildBaseline, compareToBaseline, errorCountsFromEslintJson } from './lint-ratchet-lib.mjs'

const root = process.cwd()
const baselinePath = resolve(root, '.eslint-baseline.json')
const EXT = /\.(?:ts|tsx|mjs|js|jsx)$/

function runEslint(files) {
  const args = ['eslint', '--format', 'json', ...(files ?? ['.'])]
  const run = spawnSync('npx', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  if (!run.stdout) { console.error(run.stderr || 'eslint çıktı üretmedi'); process.exit(2) }
  return errorCountsFromEslintJson(JSON.parse(run.stdout), root)
}

const arg = process.argv[2]
if (!arg) { console.error('Kullanım: lint-ratchet.mjs <taban-dal> | --update'); process.exit(2) }

if (arg === '--update') {
  const baseline = buildBaseline(runEslint())
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 1) + '\n')
  console.log(`Taban yazıldı: ${Object.keys(baseline).length} dosya, ${Object.values(baseline).reduce((a, b) => a + b, 0)} hata`)
  process.exit(0)
}

const diff = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${arg}...HEAD`], { cwd: root, encoding: 'utf8' })
if (diff.status !== 0) { console.error(diff.stderr); process.exit(2) }
const files = diff.stdout.split('\n').map(line => line.trim()).filter(line => EXT.test(line) && existsSync(resolve(root, line)))
if (!files.length) { console.log('Denetlenecek değişen kod dosyası yok.'); process.exit(0) }

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {}
const { regressions, improvements } = compareToBaseline(runEslint(files), baseline)
for (const item of improvements) console.log(`İyileşti: ${item.file} (${item.allowed} → ${item.errors}); tabanı güncelleyin: npm run lint:baseline`)
if (regressions.length) {
  console.error('eslint hata sayısı arttı (tabana göre):')
  for (const item of regressions) console.error(`  ${item.file}: ${item.errors} hata (izin verilen ${item.allowed})`)
  process.exit(1)
}
console.log(`eslint kapısı geçti (${files.length} dosya).`)
