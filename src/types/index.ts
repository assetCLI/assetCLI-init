import { PublicKey, Cluster } from "@solana/web3.js";
import BN from "bn.js";
import { BondingCurve } from "./bonding_curve";
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
}

export interface BondingCurveConfig {
  bondingCurveAddress?: string;
  mint?: string;
}

export interface Config {
  wallet?: WalletConfig;
  dao?: DaoConfig;
  squadsMultisig?: SquadsMultisigConfig;
  bondingCurve?: BondingCurveConfig;
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

export interface GlobalInitParams {
  migrateFeeAmount?: BN | undefined;
  feeReceiver?: PublicKey | undefined;
  status?:
    | { running: {} }
    | { swapOnly: {} }
    | { swapOnlyNoLaunch: {} }
    | { paused: {} }
    | undefined;
}

export interface CreateBondingCurveParams {
  name: string;
  symbol: string;
  buff?: Buffer | Uint8Array | ArrayBuffer | undefined;
  solRaiseTarget: BN;
  description: string;
  authorityAddress: PublicKey;
  treasuryAddress: PublicKey;
  mintDecimals: number;
  tokenTotalSupply: BN;
  // optional proposal metadata
  twitterHandle?: string | undefined;
  discordLink?: string | undefined;
  websiteUrl?: string | undefined;
  logoUri?: string | undefined;
  founderName?: string | undefined;
  founderTwitter?: string | undefined;
  bullishThesis?: string | undefined;
}

export interface SwapParams {
  // true = sell tokens (receive SOL), false = buy tokens (spend SOL)
  baseIn: boolean;
  amount: BN;
  minOutAmount: BN;
}

export interface BondingCurveProposal {
  mint: PublicKey;
  creator: PublicKey;
  name: string;
  description: string;
  treasuryAddress: PublicKey;
  authorityAddress: PublicKey;
  twitterHandle: string | null;
  discordLink: string | null;
  websiteUrl: string | null;
  logoUri: string | null;
  founderName: string | null;
  founderTwitter: string | null;
  bullishThesis: string | null;
  bump: number;
  solRaiseTarget?: BN;
}

export interface AMMConfig {
  /** Bump to identify PDA */
  bump: number;
  /** Status to control if new pool can be create */
  disableCreatePool: boolean;
  /** Config index */
  index: number;
  /** The trade fee, denominated in hundredths of a bip (10^-6) */
  tradeFeeRate: BN;
  /** The protocol fee */
  protocolFeeRate: BN;
  /** The fund fee, denominated in hundredths of a bip (10^-6) */
  fundFeeRate: BN;
  /** Fee for create a new pool */
  createPoolFee: BN;
  /** Address of the protocol fee owner */
  protocolOwner: PublicKey;
  /** Address of the fund fee owner */
  fundOwner: PublicKey;
  /** padding */
  padding: BN[];
}

export interface BondingCurveData {
  mint: PublicKey;
  creator: PublicKey;
  virtualSolReserves: BN;
  virtualTokenReserves: BN;
  realSolReserves: BN;
  realTokenReserves: BN;
  tokenTotalSupply: BN;
  startTime: BN;
  complete: boolean;
  tokenDecimals: number;
  solRaiseTarget: BN;
  bump: number;
  vaultBump: number;
}

export interface BondingCurveAndProposalData {
  mint: PublicKey;
  bondingCurve: BondingCurveData;
  proposal: BondingCurveProposal;
  metadata: any;
}
