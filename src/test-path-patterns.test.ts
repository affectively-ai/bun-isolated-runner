import { describe, expect, it } from 'bun:test';
import {
  filterTestsByPathPattern,
  parseTestPathPatternFlag,
} from './test-path-patterns';

describe('test-path-pattern helpers', () => {
  it('parses positional and equals style testPathPattern flags', () => {
    const args = [
      '--testPathPattern',
      'shared-ui/services',
      '--testPathPattern=shared-utils/hooks',
      '--other-flag',
    ];

    expect(parseTestPathPatternFlag(args, 0)).toEqual({
      consumedArgs: 2,
      patterns: ['shared-ui/services'],
    });
    expect(parseTestPathPatternFlag(args, 2)).toEqual({
      consumedArgs: 1,
      patterns: ['shared-utils/hooks'],
    });
    expect(parseTestPathPatternFlag(args, 3)).toBeNull();
  });

  it('filters file lists with substring and regex patterns', () => {
    const files = [
      'shared-ui/src/services/authService.test.ts',
      'shared-ui/src/hooks/useTranslation.test.ts',
      'shared-utils/src/logger.test.ts',
    ];

    const filtered = filterTestsByPathPattern(files, [
      'shared-ui/src/services',
      '^shared-utils/src/.*\\.test\\.ts$',
    ]);

    expect(filtered).toEqual([
      'shared-ui/src/services/authService.test.ts',
      'shared-utils/src/logger.test.ts',
    ]);
  });
});
