import path from "path";
import os from "os";

// Config paths
export const CONFIG_DIR = path.join(os.homedir(), ".config", "asset-cli");
export const WALLET_PATH = path.join(CONFIG_DIR, "wallet.json");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

// Network constants
export const DEFAULT_NETWORK = {
  name: "localnet",
  rpcUrl: "http://localhost:8899"
};

export const NETWORK_MAP = {
  "mainnet": {
    name: "mainnet",
    rpcUrl: "https://api.mainnet-beta.solana.com"
  },
  "devnet": {
    name: "devnet",
    rpcUrl: "https://api.devnet.solana.com"
  },
  "localnet": {
    name: "localnet",
    rpcUrl: "http://localhost:8899"
  }
};

export const RAYDIUM_PROGRAM_IDS = {
  "_": {
    CPMM_PROGRAM_ID: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
    AMM_CONFIG_ID: "D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2",
    LOCK_CPMM_PROGRAM_ID: "LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE",
    LOCK_CPMM_AUTHORITY_ID: "3f7GcQFG397GAaEnv51zR6tsTVihYRydnydDD1cXekxH",
    RAYDIUM_CREATE_POOL_FEE_RECIEVER: "DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8",
  },
  "devnet": {
    CPMM_PROGRAM_ID: "CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW",
    AMM_CONFIG_ID: "9zSzfkYy6awexsHvmggeH36pfVUdDGyCcwmjT3AQPBj6",
    LOCK_CPMM_PROGRAM_ID: "DLockwT7X7sxtLmGH9g5kmfcjaBtncdbUmi738m5bvQC",
    LOCK_CPMM_AUTHORITY_ID: "7AFUeLVRjBfzqK3tTGw8hN48KLQWSk6DTE8xprWdPqix",
    RAYDIUM_CREATE_POOL_FEE_RECIEVER: "G11FKBRaAkHAKuLCgLM6K6NUc9rTjPAznRCjZifrTQe2",
  }
}

// Program IDs
export const SQDS_PROGRAM_ID = "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";
export const METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const SPL_GOVERNANCE_PROGRAM_ID =
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw";
