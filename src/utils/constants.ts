import { Cluster } from "@solana/web3.js";
import path from "path";
import os from "os";

// Config paths
export const CONFIG_DIR = path.join(os.homedir(), ".config", "asset-cli");
export const WALLET_PATH = path.join(CONFIG_DIR, "wallet.json");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

// Network constants
export const CLUSTERS: Record<string, Cluster> = {
  mainnet: "mainnet-beta",
  devnet: "devnet",
  localhost: "testnet",
};

export const DEFAULT_CLUSTER = "testnet" as Cluster;
export const ENDPOINT_MAP: Record<Cluster, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "http://localhost:8899", // Custom testnet cluster
};

export const ENDPOINT_LOCALHOST = "http://localhost:8899";

// Governance constants
export const SPL_GOVERNANCE_PROGRAM_ID =
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw";
export const SQDS_PROGRAM_ID = "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";
export const METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
export const CPMM_PROGRAM_ID = "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C";
export const AMM_CONFIG_ID = "D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2";
export const WSOL_ID = "So11111111111111111111111111111111111111112";
export const LOCK_CPMM_PROGRAM_ID = "LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTKbpofwE";
export const LOCK_CPMM_AUTHORITY_ID = "3f7GcQFG397GAaEnv51zR6tsTVihYRydnydDD1cXekxH";
export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const RAYDIUM_CREATE_POOL_FEE = "DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8";