import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Kural (AI altyapı planı P0-1): yapay zekâ sağlayıcısını çağıran dosyalar öğrenci adı/kimlik alanlarına dokunmaz.
const PROVIDER_CALL = /anthropic\.messages\.|callOpenAI\(|new MistralAdapter|generateWithRoutedProvider\(|generativelanguage\.googleapis\.com/
const IDENTITY_FIELD = /\bfull_name\b|\bdisplayName\b|getIdentityBySupabaseId|getIdentitiesBySupabaseIds/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(path)
  }
  return out
}

test('sağlayıcı çağıran dosyalar kimlik (ad) alanı kullanmaz', () => {
  const offenders = [...walk('app'), ...walk('lib')].filter(file => {
    const source = readFileSync(file, 'utf8')
    return PROVIDER_CALL.test(source) && IDENTITY_FIELD.test(source)
  })
  assert.deepEqual(offenders, [])
})
