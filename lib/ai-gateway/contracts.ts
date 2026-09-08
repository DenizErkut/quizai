export type AIProvider = 'deterministic' | 'approved_content' | 'mistral' | 'openai' | 'anthropic' | 'google'

export type IntelligenceTask =
  | 'quiz_generation'
  | 'content_validation'
  | 'answer_evaluation'
  | 'tutor_response'
  | 'learning_recommendation'
  | 'document_extraction'
  | 'multimodal_analysis'

export type IntelligenceLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5'

export interface IntelligenceRequestContext {
  task: IntelligenceTask
  userId?: string
  sessionId?: string
  requestId?: string
  language?: string
  requiresVision?: boolean
  requiresPremiumReasoning?: boolean
  containsSensitiveStudentData?: boolean
}

export interface ModelTarget {
  provider: AIProvider
  model: string
  level: IntelligenceLevel
}

export interface IntelligenceRoutePlan {
  policyVersion: 'multi-ai-gateway-v3-p0'
  primary: ModelTarget
  fallbacks: ModelTarget[]
  validator?: ModelTarget
  reasonCode: string
}

export interface AIProviderAdapter<TRequest = unknown, TResponse = unknown> {
  readonly provider: AIProvider
  execute(request: TRequest, context: IntelligenceRequestContext): Promise<TResponse>
  isConfigured(): boolean
}
