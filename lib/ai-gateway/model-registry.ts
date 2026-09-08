import type { AIProvider, IntelligenceLevel, ModelTarget } from './contracts'

export interface RegisteredModel extends ModelTarget {
  capabilities: Array<'text' | 'json' | 'reasoning' | 'vision' | 'validation'>
  environmentKey?: string
}

const MODELS: Record<string, RegisteredModel> = {
  deterministic: { provider: 'deterministic', model: 'rules-v1', level: 'L0', capabilities: ['text', 'json'] },
  approvedContent: { provider: 'approved_content', model: 'approved-content-v1', level: 'L1', capabilities: ['text', 'json'] },
  mistralPrimary: { provider: 'mistral', model: process.env.MISTRAL_PRIMARY_MODEL || 'mistral-large-latest', level: 'L3', capabilities: ['text', 'json', 'reasoning'], environmentKey: 'MISTRAL_API_KEY' },
  openaiValidator: { provider: 'openai', model: process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4.1-mini', level: 'L4', capabilities: ['text', 'json', 'reasoning', 'validation'], environmentKey: 'OPENAI_API_KEY' },
  claudePremium: { provider: 'anthropic', model: process.env.ANTHROPIC_PREMIUM_MODEL || 'claude-sonnet-4-5', level: 'L5', capabilities: ['text', 'json', 'reasoning'], environmentKey: 'ANTHROPIC_API_KEY' },
  geminiMultimodal: { provider: 'google', model: process.env.GEMINI_MULTIMODAL_MODEL || 'gemini-3.6-flash', level: 'L4', capabilities: ['text', 'json', 'vision'], environmentKey: 'GEMINI_API_KEY' },
}

export type RegisteredModelName = keyof typeof MODELS

export function getRegisteredModel(name: RegisteredModelName): RegisteredModel {
  return MODELS[name]
}

export function isProviderConfigured(provider: AIProvider): boolean {
  const model = Object.values(MODELS).find(candidate => candidate.provider === provider)
  return !model?.environmentKey || Boolean(process.env[model.environmentKey])
}

export function asTarget(model: RegisteredModel): ModelTarget {
  return { provider: model.provider, model: model.model, level: model.level as IntelligenceLevel }
}
