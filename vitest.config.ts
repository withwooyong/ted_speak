import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.ts'],
    // npm workspaces symlink 때문에 동일 파일이 두 경로로 잡혀
    // 커버리지에서 shared/src가 탈락하는 문제 방지 — 실제 소스 경로로 통일
    alias: {
      '@ted-speak/shared': resolve(__dirname, 'packages/shared/index.ts'),
    },
    coverage: {
      provider: 'istanbul',
      include: ['packages/ai/src/**', 'packages/shared/src/**'],
      exclude: ['packages/shared/src/types.ts'], // 타입 선언만 — 런타임 코드 없음
      thresholds: { lines: 80, functions: 80, branches: 80 },
    },
  },
});
