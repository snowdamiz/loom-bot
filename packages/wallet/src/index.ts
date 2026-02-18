export { SignerClient } from './client/signer-client.js';
export { SignRequest, SignResponse } from './signer/protocol.js';
export type { SignRequest as SignRequestType, SignResponse as SignResponseType } from './signer/protocol.js';

// Balance reading
export { getBalances } from './client/balance.js';
export type { TokenBalance, WalletBalances } from './client/balance.js';

// Wallet config (DB-backed)
export {
  getWalletConfig,
  getRequiredWalletConfig,
  setWalletConfig,
  WalletConfigKeys,
} from './client/config.js';

// Spend governance
export {
  checkSpendLimits,
  getActiveSpendLimit,
  getTodaySpentLamports,
} from './governance/limits.js';
export type { SpendCheckResult } from './governance/limits.js';

// Operator notifications
export {
  notifySpendLimitBreach,
  notifyHighValueTransaction,
} from './governance/notify.js';

// Send pipeline (SOL + SPL tokens)
export {
  sendSol,
  sendSplToken,
  getTransactionHistory,
} from './client/send.js';
export type { SendResult } from './client/send.js';

// Inbound monitoring (WebSocket subscriptions)
export { subscribeToWallet } from './client/subscribe.js';
export type { InboundEvent } from './client/subscribe.js';
