import { Cluster } from "@solana/web3.js";

export interface WalletConfig {
  keypair: number[]; // Serialized keypair
  pubkey: string;
}

export interface DaoConfig {
  activeRealm?: string;
  activeMultisig?: string; // For backwards compatibility
  cluster: Cluster;
  endpoint: string;
}

export interface SquadsMultisigConfig {
  activeAddress?: string;
  // Could add more multisig-specific config options in the future
}

export interface Config {
  wallet?: WalletConfig;
  dao?: DaoConfig;
  squadsMultisig?: SquadsMultisigConfig; // Separate top-level config
}

export interface CommandOptions {
  cluster?: Cluster;
  endpoint?: string;
  keypair?: string;
}

export interface PriorityFeeResponse {
  jsonrpc: string;
  id: string;
  method: string;
  params: Array<{
    transaction: string;
    options: { priorityLevel: string };
  }>;
}

export interface WalletData {
  privateKey: string;
}
