/**
 * AI 클라이언트 공통 설정.
 *
 * ⚠️ apiKey는 호출자가 주입한다 — 모바일 앱 번들에 키를 내장하지 않는다.
 * MVP 개발 단계에서는 dev 환경변수, 출시 전 Supabase Edge Function 프록시로 전환 전제.
 */
export interface AiClientConfig {
  apiKey: string;
  baseUrl?: string;
  /** 테스트·플랫폼별 fetch 주입용. 기본은 전역 fetch */
  fetchImpl?: typeof fetch;
}

export const DEFAULT_BASE_URL = 'https://api.openai.com';

export function resolveConfig(cfg: AiClientConfig) {
  return {
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl ?? DEFAULT_BASE_URL,
    fetchImpl: cfg.fetchImpl ?? fetch,
  };
}
