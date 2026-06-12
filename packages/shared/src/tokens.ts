/**
 * TalkTed 디자인 토큰 — prototype/index.html에서 검증된 값을 그대로 이관.
 * 변경 시 프로토타입과 동기화할 것.
 */
export const colors = {
  ink: '#211D33',
  ink60: 'rgba(33,29,51,0.6)',
  ink40: 'rgba(33,29,51,0.4)',
  ink12: 'rgba(33,29,51,0.12)',
  ink06: 'rgba(33,29,51,0.06)',
  paper: '#FFFFFF',
  canvas: '#FBFAF7',
  ted: '#FF5C38',
  tedDeep: '#E8431F',
  tedSoft: '#FFEDE7',
  tedGradient: ['#FF8A3D', '#FF5C38'] as const,
  mint: '#15A37B',
  mintSoft: '#E2F6EF',
  gold: '#FFB829',
  goldSoft: '#FFF3D9',
} as const;

export const radius = {
  card: 20,
  cardLg: 24,
  button: 18,
  pill: 999,
} as const;

export const font = {
  /** UI·한국어 — 시스템 기본(SF/Roboto), 추후 Pretendard 번들 검토 */
  ui: undefined,
  /** 학습 대상 영어 문장 전용 디스플레이 세리프 */
  english: 'Fraunces',
} as const;
