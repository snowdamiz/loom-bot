import path from 'node:path';

export const REQUIRED_VERIFICATION_STAGES = [
  'compile',
  'targetedTests',
  'startupSmoke',
] as const;

export type VerificationStageName = (typeof REQUIRED_VERIFICATION_STAGES)[number];

export interface VerificationStageCommandPlan {
  name: VerificationStageName;
  required: boolean;
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  nodeMaxOldSpaceSizeMb?: number;
  reason: string;
}

export interface VerificationPlan {
  workspaceRoot: string;
  candidateFilePath: string;
  packageName: string;
  failClosedReason?: string;
  stages: VerificationStageCommandPlan[];
}

export interface BuildVerificationPlanInput {
  workspaceRoot: string;
  candidateFilePath: string;
}

const DEFAULT_MAX_OUTPUT_BYTES = 16_384;

const PACKAGE_ROUTES: Array<{ prefix: string; packageName: string }> = [
  { prefix: 'packages/tools/', packageName: '@jarvis/tools' },
  { prefix: 'packages/db/', packageName: '@jarvis/db' },
  { prefix: 'packages/ai/', packageName: '@jarvis/ai' },
  { prefix: 'packages/browser/', packageName: '@jarvis/browser' },
  { prefix: 'packages/logging/', packageName: '@jarvis/logging' },
  { prefix: 'apps/agent/', packageName: '@jarvis/agent' },
  { prefix: 'apps/dashboard/', packageName: '@jarvis/dashboard' },
  { prefix: 'apps/dashboard/client/', packageName: '@jarvis/dashboard-client' },
  { prefix: 'apps/cli/', packageName: '@jarvis/cli' },
  { prefix: 'apps/landing/', packageName: '@jarvis/landing' },
];

function normalizeCandidatePath(candidateFilePath: string): string {
  return candidateFilePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function resolvePackageName(candidateFilePath: string): string | undefined {
  const normalized = normalizeCandidatePath(candidateFilePath);
  return PACKAGE_ROUTES.find((route) => normalized.startsWith(route.prefix))?.packageName;
}

function packageBuildStage(opts: {
  name: VerificationStageName;
  packageName: string;
  workspaceRoot: string;
  timeoutMs: number;
  reason: string;
}): VerificationStageCommandPlan {
  return {
    name: opts.name,
    required: true,
    command: 'pnpm',
    args: ['--filter', opts.packageName, 'build'],
    cwd: opts.workspaceRoot,
    timeoutMs: opts.timeoutMs,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
    nodeMaxOldSpaceSizeMb: 1024,
    reason: opts.reason,
  };
}

function monorepoBuildStage(opts: {
  name: VerificationStageName;
  workspaceRoot: string;
  timeoutMs: number;
  reason: string;
}): VerificationStageCommandPlan {
  return {
    name: opts.name,
    required: true,
    command: 'pnpm',
    args: ['build'],
    cwd: opts.workspaceRoot,
    timeoutMs: opts.timeoutMs,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
    nodeMaxOldSpaceSizeMb: 1536,
    reason: opts.reason,
  };
}

export function buildVerificationPlan(
  input: BuildVerificationPlanInput,
): VerificationPlan {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const normalizedCandidate = normalizeCandidatePath(input.candidateFilePath);
  const packageName = resolvePackageName(normalizedCandidate);

  if (!packageName) {
    return {
      workspaceRoot,
      candidateFilePath: normalizedCandidate,
      packageName: 'unknown',
      failClosedReason:
        `No package route matched "${normalizedCandidate}". Falling back to full-build verification commands.`,
      stages: [
        monorepoBuildStage({
          name: 'compile',
          workspaceRoot,
          timeoutMs: 240_000,
          reason: 'Fail-closed unknown path fallback: require monorepo compile signal.',
        }),
        monorepoBuildStage({
          name: 'targetedTests',
          workspaceRoot,
          timeoutMs: 240_000,
          reason: 'Fail-closed unknown path fallback: require monorepo build as targeted-test surrogate.',
        }),
        packageBuildStage({
          name: 'startupSmoke',
          packageName: '@jarvis/agent',
          workspaceRoot,
          timeoutMs: 180_000,
          reason:
            'Fail-closed unknown path fallback: require agent package startup compatibility smoke (build-level surrogate).',
        }),
      ],
    };
  }

  return {
    workspaceRoot,
    candidateFilePath: normalizedCandidate,
    packageName,
    stages: [
      packageBuildStage({
        name: 'compile',
        packageName,
        workspaceRoot,
        timeoutMs: 120_000,
        reason: `Compile candidate package ${packageName} before promotion.`,
      }),
      packageBuildStage({
        name: 'targetedTests',
        packageName,
        workspaceRoot,
        timeoutMs: 120_000,
        reason:
          `Run deterministic targeted test surrogate for ${packageName}. Falls back to package build until dedicated targeted test scripts are available.`,
      }),
      packageBuildStage({
        name: 'startupSmoke',
        packageName: '@jarvis/agent',
        workspaceRoot,
        timeoutMs: 180_000,
        reason:
          'Require agent startup compatibility smoke before promotion (implemented here as build-level smoke surrogate).',
      }),
    ],
  };
}
