/**
 * Self-extension tool group — Phase 8.
 *
 * Tools:
 *   tool_write    — write, test, persist, and register new TypeScript tools (EXTEND-01, EXTEND-02, EXTEND-03)
 *   tool_delete   — unregister and remove agent-authored tools (EXTEND-03)
 *   schema_extend — extend database schema via transactional DDL (EXTEND-04)
 *
 * Use createSelfExtensionTools(registry, db) to get all 3 tools at once.
 */

export { compileTypeScript } from './compiler.js';
export { runInSandbox } from './sandbox-runner.js';
export type { SandboxResult } from './sandbox-runner.js';
export { runBoundedCommand } from './bounded-command.js';
export type {
  RunBoundedCommandInput,
  BoundedCommandResult,
  BoundedCommandStatus,
} from './bounded-command.js';
export {
  createIsolatedWorktree,
  cleanupIsolatedWorktree,
  WorktreeIsolationError,
} from './workspace-isolation.js';
export type {
  CreateIsolatedWorktreeInput,
  IsolatedWorktreeHandle,
  CleanupIsolatedWorktreeInput,
  CleanupIsolatedWorktreeResult,
  WorktreeIsolationFailureCategory,
  WorktreeIsolationOperation,
  WorktreeIsolationErrorDetails,
} from './workspace-isolation.js';
export {
  boundedStatusToVerificationStatus,
  inferFailureCategoryFromStage,
  buildVerificationStageResultFromCommand,
  deriveVerificationRunStatus,
  buildVerificationRunResult,
} from './verification-diagnostics.js';
export type {
  VerificationStageStatus,
  VerificationRunStatus,
  VerificationFailureCategory,
  VerificationWorkspaceSummary,
  VerificationFailureSummary,
  VerificationStageCommand,
  VerificationStageResourceSummary,
  VerificationStageResult,
  VerificationRunResult,
} from './verification-diagnostics.js';
export {
  buildVerificationPlan,
  REQUIRED_VERIFICATION_STAGES,
} from './verification-policy.js';
export type {
  BuildVerificationPlanInput,
  VerificationPlan,
  VerificationStageName,
  VerificationStageCommandPlan,
} from './verification-policy.js';
export { runIsolatedVerification } from './isolated-verifier.js';
export type {
  RunIsolatedVerificationInput,
  IsolatedVerificationEvidence,
  IsolatedVerificationResult,
} from './isolated-verifier.js';
export { loadPersistedTools, AGENT_TOOLS_DIR } from './tool-loader.js';
export { createToolWriteTool, createToolDeleteTool } from './tool-writer.js';
export { createSchemaExtendTool } from './schema-extend.js';
export { stageBuiltinChange } from './staging-deployer.js';
export { assertGitHubTrustForBuiltinModify } from './github-trust-guard.js';
export {
  resolveTrustedGitHubContext,
} from './github-trust-guard.js';
export {
  evaluatePromotionGate,
  DEFAULT_PROMOTION_CONTEXTS,
} from './promotion-gate.js';
export type {
  PromotionStatusContext,
  PromotionGateResult,
} from './promotion-gate.js';
export {
  getPromotionControlState,
  setPromotionControlState,
  PROMOTION_CONTROL_STATE_KEY,
} from './promotion-control.js';
export type {
  PromotionControlState,
} from './promotion-control.js';
export {
  appendSelfExtensionEvent,
  SELF_EXTENSION_EVENT_TYPES,
} from './lifecycle-events.js';
export type {
  SelfExtensionLifecycleEventType,
  AppendSelfExtensionEventInput,
  SelfExtensionEventWriteResult,
} from './lifecycle-events.js';
export { runGitHubSelfExtensionPipeline } from './github-pipeline.js';
export type {
  GitHubSelfExtensionPipelineInput,
  GitHubSelfExtensionPipelineResult,
  SandboxEvidence,
} from './github-pipeline.js';
export {
  buildCommitMetadata,
  stableSerialize,
} from './pipeline-context.js';
export type {
  SelfExtensionExecutionContext,
  CommitMetadataPayload,
  CommitMetadataEnvelope,
} from './pipeline-context.js';
export { buildSelfExtensionBranchName } from './branch-naming.js';

import type { DbClient } from '@jarvis/db';
import type { ToolRegistry } from '../registry.js';
import type { ToolDefinition } from '../types.js';
import { createToolWriteTool, createToolDeleteTool } from './tool-writer.js';
import { createSchemaExtendTool } from './schema-extend.js';

/**
 * createSelfExtensionTools(registry, db, onToolChange?) — convenience factory returning all 3 self-extension ToolDefinitions.
 *
 * Returns 3 tools:
 * 1. tool_write    — write/test/persist/register TypeScript tools (EXTEND-01, 02, 03, 05)
 * 2. tool_delete   — unregister and remove agent-authored tools
 * 3. schema_extend — extend database schema with transactional DDL (EXTEND-04)
 *
 * The registry reference is passed to tool_write/tool_delete so they can
 * register/unregister tools at runtime.
 *
 * @param registry - The ToolRegistry instance (passed by reference)
 * @param db - DB client used by builtin trust guard checks
 * @param onToolChange - Optional callback invoked after tool_write or tool_delete succeeds.
 *   Used by the agent process to enqueue a reload-tools BullMQ job so the worker process
 *   stays in sync. Fire-and-forget — errors are caught at the call site.
 */
export function createSelfExtensionTools(
  registry: ToolRegistry,
  db: DbClient,
  onToolChange?: () => void,
): ToolDefinition<unknown, unknown>[] {
  return [
    createToolWriteTool(registry, db, onToolChange),
    createToolDeleteTool(registry, onToolChange),
    createSchemaExtendTool(),
  ];
}
