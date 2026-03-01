interface ParsedTestPathPatternFlag {
  consumedArgs: number;
  patterns: string[];
}

function toPortablePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function stripOuterQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '');
}

function isTestPathPatternKey(arg: string): boolean {
  return arg === '--testPathPattern' || arg === '--testPathPatterns';
}

function isTestPathPatternEqualsKey(arg: string): boolean {
  return (
    arg.startsWith('--testPathPattern=') ||
    arg.startsWith('--testPathPatterns=')
  );
}

function extractEqualsValue(arg: string): string {
  return arg.split('=').slice(1).join('=');
}

export function parseTestPathPatternFlag(
  rawArgs: string[],
  index: number
): ParsedTestPathPatternFlag | null {
  const arg = rawArgs[index];

  if (isTestPathPatternKey(arg)) {
    const nextArg = rawArgs[index + 1];
    return {
      consumedArgs: 2,
      patterns: nextArg ? [nextArg] : [],
    };
  }

  if (isTestPathPatternEqualsKey(arg)) {
    const pattern = extractEqualsValue(arg);
    return {
      consumedArgs: 1,
      patterns: pattern ? [pattern] : [],
    };
  }

  return null;
}

function matchesTestPathPattern(filePath: string, pattern: string): boolean {
  const normalizedFilePath = toPortablePath(filePath);
  const rawPattern = stripOuterQuotes(pattern.trim());
  const normalizedPattern = toPortablePath(rawPattern);

  if (!normalizedPattern) {
    return false;
  }

  // Prefer literal substring matching for common --testPathPattern usage.
  if (normalizedFilePath.includes(normalizedPattern)) {
    return true;
  }

  try {
    return new RegExp(rawPattern).test(normalizedFilePath);
  } catch {
    return false;
  }
}

export function filterTestsByPathPattern(
  files: string[],
  testPathPatterns: string[] = []
): string[] {
  if (testPathPatterns.length === 0) {
    return files;
  }

  return files.filter((filePath) =>
    testPathPatterns.some((pattern) =>
      matchesTestPathPattern(filePath, pattern)
    )
  );
}
