/**
 * use-save-expression.ts — 교정(Correction)을 복습 목록에 저장하는 훅 (P2 W5).
 * tutor 세션·히스토리 상세에서 교정 칩 길게 누르기로 공유한다.
 *
 * 저장은 idempotent(중복 무시) — 이미 저장된 교정은 isSaved로 표시한다.
 * 저장 실패는 조용히 무시한다(부가 기능 — 대화 흐름을 막지 않는다, PII 미로깅).
 */
import type { Correction } from '@ted-speak/shared';
import { useCallback, useEffect, useState } from 'react';

import { getSavedRepo } from '@/lib/saved';

/**
 * 중복 판정 키 — (original, suggested) 쌍 (DB unique 제약과 동일 기준).
 * JSON 배열로 직렬화해 구분자 충돌(original/suggested에 구분자 문자가 들어가도)을 피한다.
 */
function correctionKey(c: Pick<Correction, 'original' | 'suggested'>): string {
  return JSON.stringify([c.original, c.suggested]);
}

export function useSaveExpression() {
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());

  // 마운트 시 기존 저장 표현 키를 적재해 이미 저장된 칩을 표시한다.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const repo = getSavedRepo();
      if (!repo) return;
      try {
        const list = await repo.list();
        if (alive) setSavedKeys(new Set(list.map(correctionKey)));
      } catch {
        // 무시 — 표시용 초기 상태일 뿐
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const saveCorrection = useCallback(async (correction: Correction, context?: string) => {
    const repo = getSavedRepo();
    if (!repo) return;
    const key = correctionKey(correction);
    // 낙관적 표시 — 실패해도 대화를 막지 않는다
    setSavedKeys((prev) => new Set(prev).add(key));
    try {
      await repo.save({
        original: correction.original,
        suggested: correction.suggested,
        type: correction.type,
        context,
      });
    } catch {
      // 저장 실패 — 낙관적 ✓를 되돌려 화면 표시를 실제 상태와 맞춘다(PII 미로깅).
      // 사용자가 다시 길게 눌러 재시도할 수 있다.
      setSavedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const isSaved = useCallback(
    (c: Pick<Correction, 'original' | 'suggested'>) => savedKeys.has(correctionKey(c)),
    [savedKeys],
  );

  return { saveCorrection, isSaved };
}
