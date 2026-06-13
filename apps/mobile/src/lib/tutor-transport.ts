/**
 * tutor-transport.ts — 프리토킹 전송 계층 인터페이스 + 구현 (P2 W2).
 *
 * tutor-core(상태머신)와 UI는 이 인터페이스(`TutorTransport`)에만 의존한다.
 * 전송 구현을 교체해도 코어·UI는 그대로다(ADR-0008 심/seam 전략).
 *
 *  - `MockTutorTransport`: 결정적 — 디바이스/네트워크 없이 UI·코어를 E2E 구동·테스트한다.
 *    텍스트 입력 폴백(마이크/네트워크 부재 시 — ADR-0005 Fallback 원칙)도 이 경로를 쓴다.
 *  - `RealtimeTutorTransport`: 라이브 음성(WebRTC) — **이월 스텁**. 실제 구현·실기기는 후속
 *    (커스텀 dev build 필요). W1 스파이크(packages/ai/spike/realtime.mts)가 프로토콜 레퍼런스.
 */
import type { Correction, RoleplayScenario } from '@ted-speak/shared';

export interface TutorReply {
  reply: string;
  corrections: Correction[];
  /** 이 턴에 달성된 롤플레이 목표 id — 프리토킹/일반 목에서는 미지정 */
  metObjectiveIds?: string[];
}

export interface TutorTransportCallbacks {
  onConnected?: () => void;
  onTedReply: (reply: TutorReply) => void;
  onError?: (err: Error) => void;
}

export interface TutorTransport {
  connect: () => Promise<void>;
  sendUserText: (text: string) => Promise<void>;
  /** Ted 발화 중 끼어들기(취소) — 라이브 전송에서만 의미, 목에서는 no-op */
  bargeIn: () => void;
  close: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock 전송 — 주제별 스크립트 응답, 결정적
// ─────────────────────────────────────────────────────────────────────────────

/** 주제별 기본 Ted 응답 스크립트 (순환 사용) — 짧고 격려하는 후속 질문 위주 */
const DEFAULT_SCRIPT: TutorReply[] = [
  { reply: 'That sounds nice! Can you tell me more?', corrections: [] },
  {
    reply: 'Great. How did that make you feel?',
    corrections: [{ original: 'I very like it', suggested: 'I really like it', type: 'grammar' }],
  },
  { reply: 'Interesting! And what happened next?', corrections: [] },
  {
    reply: 'Good job. What do you usually do after that?',
    corrections: [{ original: 'good', suggested: 'wonderful', type: 'vocab' }],
  },
];

export interface MockTransportOptions {
  /** 응답 스크립트 오버라이드 — 미지정 시 DEFAULT_SCRIPT를 순환한다 */
  replies?: TutorReply[];
}

export function createMockTutorTransport(
  _topicId: string,
  callbacks: TutorTransportCallbacks,
  opts: MockTransportOptions = {},
): TutorTransport {
  const script = opts.replies && opts.replies.length > 0 ? opts.replies : DEFAULT_SCRIPT;
  let closed = false;
  let connected = false;
  let cursor = 0;

  return {
    async connect() {
      connected = true;
      callbacks.onConnected?.();
    },

    async sendUserText(_text) {
      if (closed || !connected) return;
      const reply = script[cursor % script.length];
      cursor += 1;
      // 방어 복제 — 호출자가 corrections 배열을 변형해도 스크립트 원본을 오염시키지 않는다
      callbacks.onTedReply({ reply: reply.reply, corrections: [...reply.corrections] });
    },

    bargeIn() {
      // 목에는 진행 중인 발화가 없다 — no-op
    },

    close() {
      closed = true;
      connected = false;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 롤플레이 목 전송 — 시나리오 목표를 턴마다 순서대로 달성 신호 (P2 W3)
// ─────────────────────────────────────────────────────────────────────────────

/** 롤플레이 진행용 후속 멘트 (순환) — 배역 무관하게 자연스러운 짧은 응답 */
const ROLEPLAY_FOLLOWUPS: readonly string[] = [
  'Great, thank you! What would you like next?',
  'Perfect, got it. Anything else?',
  'Sounds good — let’s keep going.',
];
/** 모든 목표 달성 후의 마무리 멘트 */
const ROLEPLAY_CLOSING = 'Wonderful — I think we covered everything. Well done! 🎉';

export interface RoleplayMockOptions {
  /** 응답 텍스트 오버라이드(순환) — 목표 신호는 그대로 시나리오 objectives를 따른다 */
  replies?: string[];
}

/**
 * 롤플레이용 결정적 목 전송.
 * sendUserText 호출마다 시나리오 objectives를 **순서대로 1개씩** 달성 신호하고,
 * 모든 목표를 신호한 뒤에는 더 신호하지 않는다(코어가 합집합 머지로 판정).
 * 텍스트 미리보기/폴백 경로(ADR-0005)도 이 전송을 공유한다. 라이브 판정은 이월(Realtime).
 */
export function createRoleplayMockTransport(
  scenario: RoleplayScenario,
  callbacks: TutorTransportCallbacks,
  opts: RoleplayMockOptions = {},
): TutorTransport {
  const followups = opts.replies && opts.replies.length > 0 ? opts.replies : ROLEPLAY_FOLLOWUPS;
  let closed = false;
  let connected = false;
  let turn = 0;

  return {
    async connect() {
      connected = true;
      callbacks.onConnected?.();
    },

    async sendUserText(_text) {
      if (closed || !connected) return;
      const objective = scenario.objectives[turn];
      const reply = objective
        ? followups[turn % followups.length]
        : ROLEPLAY_CLOSING;
      const metObjectiveIds = objective ? [objective.id] : [];
      turn += 1;
      callbacks.onTedReply({ reply, corrections: [], metObjectiveIds });
    },

    bargeIn() {
      // 목에는 진행 중인 발화가 없다 — no-op
    },

    close() {
      closed = true;
      connected = false;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Realtime 전송 — 이월 스텁 (라이브 음성은 dev build 필요)
// ─────────────────────────────────────────────────────────────────────────────

export interface RealtimeTransportOptions {
  apiKey: string;
  topicId: string;
}

/**
 * 라이브 Realtime(WebRTC) 전송 — **미구현 이월 스텁**.
 * RN에서 라이브 음성은 react-native-webrtc + 커스텀 dev build가 필요하다(ADR-0008).
 * connect()는 명확한 안내 에러로 거부하므로, 호출부(UI)가 잡아 목/텍스트 폴백으로 전환할 수 있다.
 */
export function createRealtimeTutorTransport(
  _opts: RealtimeTransportOptions,
  _callbacks: TutorTransportCallbacks,
): TutorTransport {
  return {
    async connect() {
      throw new Error(
        '라이브 음성 전송은 커스텀 dev build가 필요합니다 (react-native-webrtc, ADR-0008). 후속 작업으로 이월되었습니다.',
      );
    },
    async sendUserText() {
      // 연결되지 않으므로 호출되지 않는다 — 계약 유지용 no-op
    },
    bargeIn() {},
    close() {},
  };
}
