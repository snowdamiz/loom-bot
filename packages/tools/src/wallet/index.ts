import { z } from 'zod';
import type { DbClient } from '@jarvis/db';
import type { ToolDefinition } from '../types.js';
import {
  getBalances,
  sendSol,
  sendSplToken,
  getTransactionHistory,
  SignerClient,
} from '@jarvis/wallet';

/**
 * Factory function that returns an array of 4 wallet ToolDefinitions.
 *
 * All wallet tools are created via factory because they need DB and SignerClient
 * injection at construction time — same pattern as createDbTool(db).
 *
 * Tools created:
 * 1. get_balance  — reads SOL + all SPL token balances from on-chain RPC
 * 2. send_sol     — sends SOL through governance -> sign -> broadcast -> log pipeline
 * 3. send_token   — sends SPL token (auto-detects TOKEN_PROGRAM_ID vs TOKEN_2022_PROGRAM_ID)
 * 4. get_tx_history — queries wallet_transactions table for audit/decision use
 *
 * All sends go through governance (checkSpendLimits) before signing.
 * All transactions are logged to wallet_transactions DB table.
 */
export function createWalletTools(
  db: DbClient,
  signerClient: SignerClient,
): ToolDefinition[] {
  const getBalanceTool: ToolDefinition = {
    name: 'get_balance',
    description:
      'Get the wallet SOL balance and all SPL token balances. ' +
      'Returns SOL in lamports and SOL units, plus all token holdings with ' +
      'mint address, amount, decimals, and human-readable amount.',
    inputSchema: z.object({}),
    timeoutMs: 30_000,
    execute: async (_input, _signal) => {
      return getBalances(db);
    },
  };

  const sendSolTool: ToolDefinition = {
    name: 'send_sol',
    description:
      'Send SOL to a specified Solana address. ' +
      'Amount is in lamports (1 SOL = 1,000,000,000 lamports). ' +
      'Requires a stated purpose for the transaction audit trail. ' +
      'The transaction goes through spend limit governance before signing. ' +
      'Returns success status, transaction signature, and the DB transaction ID.',
    inputSchema: z.object({
      destination: z.string().min(32, 'Solana address must be at least 32 characters'),
      amountLamports: z.string().regex(/^\d+$/, 'amountLamports must be a positive integer string'),
      purpose: z.string().min(1, 'purpose is required for audit trail'),
    }),
    timeoutMs: 60_000,
    execute: async (input, _signal) => {
      const { destination, amountLamports, purpose } = input as {
        destination: string;
        amountLamports: string;
        purpose: string;
      };
      return sendSol(db, signerClient, destination, amountLamports, purpose);
    },
  };

  const sendTokenTool: ToolDefinition = {
    name: 'send_token',
    description:
      'Send an SPL token to a specified Solana address. ' +
      'Specify the token mint address and amount in base units (accounting for decimals — ' +
      'e.g. for USDC with 6 decimals, 1000000 = 1 USDC). ' +
      'Automatically handles ATA creation if the destination has never held this token. ' +
      'Requires a stated purpose for the audit trail.',
    inputSchema: z.object({
      destination: z.string().min(32, 'Solana address must be at least 32 characters'),
      mintAddress: z.string().min(32, 'Mint address must be at least 32 characters'),
      amount: z.string().regex(/^\d+$/, 'amount must be a positive integer string in base units'),
      purpose: z.string().min(1, 'purpose is required for audit trail'),
    }),
    timeoutMs: 60_000,
    execute: async (input, _signal) => {
      const { destination, mintAddress, amount, purpose } = input as {
        destination: string;
        mintAddress: string;
        amount: string;
        purpose: string;
      };
      return sendSplToken(db, signerClient, destination, mintAddress, amount, purpose);
    },
  };

  const getTxHistoryTool: ToolDefinition = {
    name: 'get_tx_history',
    description:
      'Query the wallet transaction history. ' +
      'Returns past sends with destination, amount, purpose, status, and timestamp. ' +
      'Useful for reviewing past spending and making informed financial decisions. ' +
      'Status can be: submitted, confirmed, failed, or rejected.',
    inputSchema: z.object({
      limit: z.number().int().positive().optional().default(50),
      offset: z.number().int().min(0).optional().default(0),
    }),
    timeoutMs: 15_000,
    execute: async (input, _signal) => {
      const { limit, offset } = input as { limit: number; offset: number };
      return getTransactionHistory(db, limit, offset);
    },
  };

  return [getBalanceTool, sendSolTool, sendTokenTool, getTxHistoryTool];
}
