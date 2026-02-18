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
