import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.ts', 'apps/mobile/test/**/*.test.ts'],
    // npm workspaces symlink 때문에 동일 파일이 두 경로로 잡혀
    // 커버리지에서 shared/src가 탈락하는 문제 방지 — 실제 소스 경로로 통일
    alias: {
      '@ted-speak/shared': resolve(__dirname, 'packages/shared/index.ts'),
    },
    coverage: {
      provider: 'istanbul',
      // 앱은 순수 로직 모듈만 커버리지 대상 (RN 의존 화면·클라이언트는 E2E로 검증)
      include: [
        'packages/ai/src/**',
        'packages/shared/src/**',
        'apps/mobile/src/lib/auth-config.ts',
        'apps/mobile/src/lib/recorder-core.ts',
        'apps/mobile/src/lib/tts-cache.ts',
        'apps/mobile/src/lib/lesson-core.ts',
        'apps/mobile/src/lib/tutor-core.ts',
        'apps/mobile/src/lib/tutor-repo.ts',
        'apps/mobile/src/lib/tutor-transport.ts',
        'apps/mobile/src/lib/saved-repo.ts',
        'apps/mobile/src/lib/progress-repo.ts',
        'apps/mobile/src/lib/history.ts',
        'apps/mobile/src/lib/login-core.ts',
        'apps/mobile/src/stores/auth-core.ts',
        'apps/mobile/src/stores/user-core.ts',
      ],
      exclude: ['packages/shared/src/types.ts'], // 타입 선언만 — 런타임 코드 없음
      thresholds: { lines: 80, functions: 80, branches: 80 },
    },
  },
});
