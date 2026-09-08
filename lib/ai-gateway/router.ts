import type { IntelligenceRequestContext, IntelligenceRoutePlan } from './contracts'
import { asTarget, getRegisteredModel, isProviderConfigured } from './model-registry'

// P0 yalnızca karar üretir; mevcut API rotaları kademeli taşınana kadar hiçbir
// sağlayıcı çağrısını kendiliğinden değiştirmez. Böylece politika merkezi olur,
// fakat canlı davranış kontrollü geçiş bayrağı olmadan değişmez.
export function buildIntelligenceRoutePlan(context: IntelligenceRequestContext): IntelligenceRoutePlan {
  const openai = asTarget(getRegisteredModel('openaiValidator'))
  const claude = asTarget(getRegisteredModel('claudePremium'))
  const gemini = asTarget(getRegisteredModel('geminiMultimodal'))
  const mistral = asTarget(getRegisteredModel('mistralPrimary'))

  if (context.requiresVision || context.task === 'multimodal_analysis') {
    return {
      policyVersion: 'multi-ai-gateway-v3-p0',
      primary: gemini,
      fallbacks: [openai, claude].filter(target => isProviderConfigured(target.provider)),
      reasonCode: 'MULTIMODAL_TO_GEMINI',
    }
  }

  if (context.task === 'content_validation') {
    return {
      policyVersion: 'multi-ai-gateway-v3-p0',
      primary: openai,
      fallbacks: [claude].filter(target => isProviderConfigured(target.provider)),
      reasonCode: 'INDEPENDENT_OPENAI_VALIDATION',
    }
  }

  if (context.requiresPremiumReasoning) {
    return {
      policyVersion: 'multi-ai-gateway-v3-p0',
      primary: claude,
      fallbacks: [openai].filter(target => isProviderConfigured(target.provider)),
      reasonCode: 'PREMIUM_REASONING_ESCALATION',
    }
  }

  // Hedef mimari Mistral-first'tür. Anahtar henüz tanımlı değilse mevcut
  // Claude üretim yolu korunur; bu durum telemetry'de reasonCode ile görünür.
  const mistralReady = isProviderConfigured('mistral')
  return {
    policyVersion: 'multi-ai-gateway-v3-p0',
    primary: mistralReady ? mistral : claude,
    fallbacks: [openai, claude].filter(target => target.provider !== (mistralReady ? 'mistral' : 'anthropic') && isProviderConfigured(target.provider)),
    validator: openai,
    reasonCode: mistralReady ? 'MISTRAL_FIRST' : 'MISTRAL_NOT_CONFIGURED_KEEP_CURRENT_PROVIDER',
  }
}
