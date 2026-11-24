#!/usr/bin/env node
// Hugging Face model doğrulama kartı üretici (AI altyapı planı P1-2).
// huggingface.co'ya erişimi olan bir ortamda çalıştırın: node scripts/ai-benchmark/verify-model-card.mjs BAAI/bge-m3 [--out docs/ai/models]
// Yalnızca genel (kimlik doğrulamasız) Hub API'sini okur; ağırlık indirmez. Çıktı: lisans, commit SHA, safetensors varlığı, kapılı mı, diller, son güncelleme.
// Test için: --from-file ornek.json (Hub API yanıtı) ile ağsız çalışır. UYARI: gerçek Hub'a karşı bu çalışma ortamında denenemedi (proxy erişimi yok).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

export function summarizeModelInfo(info) {
  const files = (info.siblings || []).map(file => file.rfilename)
  const tags = info.tags || []
  const license = (tags.find(tag => tag.startsWith('license:')) || '').replace('license:', '') || info.cardData?.license || null
  return {
    id: info.id || info.modelId,
    sha: info.sha || null,
    license,
    licenseName: info.cardData?.license_name || null,
    gated: info.gated || false,
    lastModified: info.lastModified || null,
    languages: info.cardData?.language || tags.filter(tag => /^[a-z]{2,3}$/.test(tag)),
    pipeline: info.pipeline_tag || null,
    hasSafetensors: files.some(name => name.endsWith('.safetensors')),
    hasPickleWeights: files.some(name => /\.(bin|pt|pth|ckpt)$/.test(name)),
    hasLicenseFile: files.some(name => /^LICENSE(\.md|\.txt)?$/i.test(name)),
    needsRemoteCode: tags.includes('custom_code') || files.includes('modeling.py'),
    warnings: [],
  }
}

export function reviewSummary(summary) {
  const warnings = []
  if (!summary.license) warnings.push('LİSANS_ETİKETİ_YOK: elle doğrula')
  if (summary.gated) warnings.push('KAPILI_MODEL: kabul kaydı arşivle (ör. Llama)')
  if (!summary.hasSafetensors) warnings.push('SAFETENSORS_YOK: üretime alma')
  if (summary.hasPickleWeights) warnings.push('PICKLE_AĞIRLIK_VAR: yalnız safetensors dosyalarını kullan')
  if (!summary.hasLicenseFile) warnings.push('LICENSE_DOSYASI_YOK')
  if (summary.needsRemoteCode) warnings.push('UZAK_KOD_GEREKİYOR: trust_remote_code=False ile çalışmaz')
  return { ...summary, warnings }
}

async function main() {
  const [, , id, ...rest] = process.argv
  const flags = Object.fromEntries(rest.reduce((acc, token, i) => { if (token.startsWith('--')) acc.push([token.slice(2), rest[i + 1]]); return acc }, []))
  if (!id) { console.error('Kullanım: verify-model-card.mjs <org/model> [--out klasör] [--from-file json]'); process.exit(2) }
  const info = flags['from-file'] ? JSON.parse(readFileSync(flags['from-file'], 'utf8')) : await (async () => {
    const response = await fetch(`https://huggingface.co/api/models/${id}`, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`HUB_HTTP_${response.status}`)
    return response.json()
  })()
  const card = reviewSummary(summarizeModelInfo(info))
  console.log(JSON.stringify(card, null, 2))
  if (flags.out) {
    mkdirSync(flags.out, { recursive: true })
    writeFileSync(`${flags.out}/${id.replace('/', '__')}.json`, JSON.stringify({ ...card, verifiedAt: new Date().toISOString(), humanApproval: null }, null, 2))
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(String(error?.message || error)); process.exit(1) })
