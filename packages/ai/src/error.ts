/** OpenAI API 호출 실패 — HTTP 오류·응답 계약 위반을 구분 가능한 형태로 전달 */
export class AiError extends Error {
  constructor(
    message: string,
    /** HTTP 상태 코드. 응답 파싱 실패 등 비-HTTP 오류면 undefined */
    public readonly status?: number,
    /** 디버깅용 응답 본문 (민감정보 없음 — API 오류 메시지만) */
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export async function throwIfNotOk(res: Response, stage: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => '');
  throw new AiError(`${stage} 요청 실패 (HTTP ${res.status})`, res.status, body.slice(0, 500));
}
