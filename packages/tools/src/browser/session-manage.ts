import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { BrowserSession, type BrowserManager } from '@jarvis/browser';
import type { ToolDefinition } from '../types.js';
import { activeSessions, generateSessionId } from './_state.js';

/**
 * browser_session_open — open a new isolated browser session for an identity.
 *
 * Creates a BrowserContext with optional proxy, storageState, and browser fingerprint options.
 * Opens an initial page and stores both in activeSessions map.
 *
 * The sessionId returned must be passed to all subsequent browser tool calls.
 */
export function createBrowserSessionOpenTool(browserManager: BrowserManager): ToolDefinition {
  return {
    name: 'browser_session_open',
    description:
      'Open a new isolated browser session for an identity. ' +
      'Returns a sessionId to use in all subsequent browser tool calls. ' +
      'Optionally restore a prior session from storageStatePath (cookies + localStorage). ' +
      'Optionally route traffic through a proxy for network-level identity isolation.',
    inputSchema: z.object({
      identityId: z.string().optional().default('anonymous'),
      proxy: z
        .object({
          server: z.string(),
          username: z.string().optional(),
          password: z.string().optional(),
        })
        .optional(),
      storageStatePath: z.string().optional(),
      userAgent: z.string().optional(),
      viewport: z
        .object({
          width: z.number().int().positive(),
          height: z.number().int().positive(),
        })
        .optional(),
    }),
    timeoutMs: 30_000,
    execute: async (input, _signal) => {
      const { identityId, proxy, storageStatePath, userAgent, viewport } = input as {
        identityId: string;
        proxy?: { server: string; username?: string; password?: string };
        storageStatePath?: string;
        userAgent?: string;
        viewport?: { width: number; height: number };
      };
      try {
        const session = new BrowserSession({
          manager: browserManager,
          identityId,
          proxy,
          storageStatePath,
          userAgent,
          viewport,
        });

        await session.open();
        const page = await session.newPage();

        const sessionId = generateSessionId();
        activeSessions.set(sessionId, { session, page, identityId });

        return {
          sessionId,
          identityId,
          message: 'Browser session opened. Use sessionId in subsequent browser tool calls.',
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    },
  };
}

/**
 * browser_session_close — close an active browser session and free resources.
 *
 * Closes the BrowserContext and removes the session from activeSessions map.
 */
export function createBrowserSessionCloseTool(): ToolDefinition {
  return {
    name: 'browser_session_close',
    description:
      'Close an active browser session and free all associated resources (context, pages). ' +
      'Always close sessions when done to prevent resource leaks.',
    inputSchema: z.object({
      sessionId: z.string().min(1, 'sessionId is required'),
    }),
    timeoutMs: 15_000,
    execute: async (input, _signal) => {
      const { sessionId } = input as { sessionId: string };
      try {
        const entry = activeSessions.get(sessionId);
        if (!entry) {
          return { closed: false, error: `No active session with id '${sessionId}'` };
        }
        await entry.session.close();
        activeSessions.delete(sessionId);
        return { closed: true, sessionId };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { closed: false, error: message };
      }
    },
  };
}

/**
 * browser_session_save — persist session cookies and localStorage to a JSON file.
 *
 * Saves the storageState (cookies + localStorage) to a file.
 * The saved file can later be passed as storageStatePath to browser_session_open
 * to restore the session without re-authenticating.
 *
 * Default save path: data/sessions/{identityId}.json
 */
export function createBrowserSessionSaveTool(): ToolDefinition {
  return {
    name: 'browser_session_save',
    description:
      'Save the current browser session state (cookies + localStorage) to a JSON file. ' +
      'Pass the saved path as storageStatePath when opening a future session to restore it. ' +
      "Default save path: data/sessions/{identityId}.json",
    inputSchema: z.object({
      sessionId: z.string().min(1, 'sessionId is required'),
      savePath: z.string().optional(),
    }),
    timeoutMs: 15_000,
    execute: async (input, _signal) => {
      const { sessionId, savePath } = input as { sessionId: string; savePath?: string };
      try {
        const entry = activeSessions.get(sessionId);
        if (!entry) {
          return { saved: false, error: `No active session with id '${sessionId}'` };
        }

        const resolvedPath = savePath ?? `data/sessions/${entry.identityId}.json`;

        // Ensure directory exists
        mkdirSync(dirname(resolvedPath), { recursive: true });

        await entry.session.saveState(resolvedPath);
        return { saved: true, path: resolvedPath };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { saved: false, error: message };
      }
    },
  };
}
