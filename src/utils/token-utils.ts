import { Connection, PublicKey } from "@solana/web3.js";
import {
  getMint,
  Mint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  fetchMetadataFromSeeds,
  Metadata,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey } from "@metaplex-foundation/umi";
import { ServiceResponse } from "../types/service-types";

export interface TokenMetadataInfo {
  mint: Mint | undefined;
  metadata?: {
    name?: string;
    symbol?: string;
    uri?: string;
  } | undefined;
  decimals: number ;
}

export async function getMintInfo(
  connection: Connection,
  mintAddress: PublicKey,
  programId?: PublicKey
): Promise<ServiceResponse<Mint>> {
  try {
    const mintInfo = await getMint(
      connection,
      mintAddress,
      "confirmed",
      programId || TOKEN_PROGRAM_ID
    );

    return {
      success: true,
      data: mintInfo,
    };
  } catch (error: any) {
    // Try with TOKEN_2022_PROGRAM_ID if programId wasn't specified
    if (!programId) {
      try {
        const mintInfo = await getMint(
          connection,
          mintAddress,
          "confirmed",
          TOKEN_2022_PROGRAM_ID
        );
        return {
          success: true,
          data: mintInfo,
        };
      } catch (secondError) {
        // Both attempts failed
      }
    }

    return {
      success: false,
      error: {
        message: `Failed to get mint info: ${error.message}`,
        details: error,
      },
    };
  }
}

export async function getTokenMetadata(
  connection: Connection,
  mintAddress: PublicKey
): Promise<ServiceResponse<Metadata>> {
  try {
    const umi = createUmi(connection).use(mplTokenMetadata());
    const metadata = await fetchMetadataFromSeeds(umi, {
      mint: publicKey(mintAddress),
    });

    return {
      success: true,
      data: metadata,
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: `Failed to get token metadata: ${error.message}`,
        details: error,
      },
    };
  }
}

export async function getTokenInfo(
  connection: Connection,
  mintAddress: PublicKey,
  programId?: PublicKey
): Promise<ServiceResponse<TokenMetadataInfo>> {
  try {
    // Get mint info
    const mintInfoResult = await getMintInfo(
      connection,
      mintAddress,
      programId
    );
    if (!mintInfoResult.success) {
      return {
        success: false,
        error: mintInfoResult.error!,
      };
    }

    const mintInfo = mintInfoResult.data;

    // Get metadata (optional)
    let metadata: Metadata | undefined;
    try {
      const metadataResult = await getTokenMetadata(connection, mintAddress);
      if (metadataResult.success) {
        metadata = metadataResult.data;
      }
    } catch (error) {
      // Metadata fetch failed but we can continue
    }

    return {
      success: true,
      data: {
        mint: mintInfo,
        metadata: metadata
          ? {
              name: metadata.name,
              symbol: metadata.symbol,
              uri: metadata.uri,
            }
          : undefined,
        decimals: mintInfo?.decimals || 0,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: `Failed to get token info: ${error.message}`,
        details: error,
      },
    };
  }
}

// Format token amount for display based on decimals
export function formatTokenAmount(
  amount: number | string | bigint,
  decimals: number
): string {
  const amountBigInt =
    typeof amount === "bigint" ? amount : BigInt(amount.toString());

  const divisor = BigInt(10) ** BigInt(decimals);
  const wholePart = amountBigInt / divisor;
  const fractionalPart = amountBigInt % divisor;

  // Format fractional part with leading zeros
  let fractionalString = fractionalPart.toString().padStart(decimals, "0");

  // Trim trailing zeros
  fractionalString = fractionalString.replace(/0+$/, "");

  return fractionalString
    ? `${wholePart}.${fractionalString}`
    : wholePart.toString();
}

// Format token symbol from metadata or mint address
export function formatTokenSymbol(
  metadata?: { symbol?: string },
  mintAddress?: string
): string {
  if (metadata?.symbol) {
    return metadata.symbol;
  } else if (mintAddress) {
    return mintAddress.substring(0, 4) + "...";
  } else {
    return "TOKEN";
  }
}
