import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  init,
  swapExactIn,
  addLiquidity,
  removeLiquidity,
  PRODUCTION_POOLS,
} from "@perena/numeraire-sdk";
import { ServiceResponse } from "../types/service-types";

export interface SwapParams {
  pool: PublicKey | keyof typeof PRODUCTION_POOLS;
  inToken: number | string; // index or mint address
  outToken: number | string; // index or mint address
  exactAmountIn: number;
  minAmountOut: number;
  cuLimit?: number;
}

export interface AddLiquidityParams {
  pool: PublicKey | keyof typeof PRODUCTION_POOLS;
  maxAmountsIn: number[];
  minLpTokenMintAmount: number;
  takeSwaps?: boolean;
}

export interface RemoveLiquidityParams {
  pool: PublicKey | keyof typeof PRODUCTION_POOLS;
  lpTokenRedeemAmount: number;
}

export class PeranaService {
  /**
   * Initialize the Perena SDK
   */
  private static initialize(
    keypair?: Keypair,
    applyD: boolean = false,
    connection?: Connection
  ): ServiceResponse<ReturnType<typeof init>> {
    try {
      const state = init({
        payer: keypair,
        applyD: applyD,
        connection:
          connection || new Connection("https://api.mainnet-beta.solana.com"),
      });

      return {
        success: true,
        data: state,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to initialize Perana SDK",
          details: error,
        },
      };
    }
  }

  /**
   * Swap tokens using Numeraire pools
   */
  static async swap(
    connection: Connection,
    params: SwapParams,
    keypair: Keypair
  ): Promise<ServiceResponse<string>> {
    try {
      // Initialize SDK if not already initialized
      this.initialize(keypair, false, connection);

      // Resolve pool address if a key is provided
      const poolAddress =
        typeof params.pool === "string"
          ? new PublicKey(
              PRODUCTION_POOLS[params.pool as keyof typeof PRODUCTION_POOLS]
            )
          : params.pool;
      
      

      // Call swap function from SDK
      try {
        const { call } = await swapExactIn({
          pool: poolAddress,
          in: params.inToken,
          out: params.outToken,
          exactAmountIn: params.exactAmountIn,
          minAmountOut: params.minAmountOut,
          cuLimit: params.cuLimit || 1500000,
        });

        // Execute swap and return transaction signature
        const txSignature = await call.rpc();

        return {
          success: true,
          data: txSignature,
        };
      } catch (error) {
        return {
          success: false,
          error: {
            message: "Swap failed rpc failed",
            details: error,
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Swap failed",
          details: error,
        },
      };
    }
  }

  /**
   * Add liquidity to a Numeraire pool
   */
  static async addLiquidity(
    connection: Connection,
    keypair: Keypair,
    params: AddLiquidityParams
  ): Promise<ServiceResponse<string>> {
    try {
      // Initialize SDK with keypair
      this.initialize(keypair, false, connection);

      // Resolve pool address if a key is provided
      const poolAddress =
        typeof params.pool === "string"
          ? new PublicKey(
              PRODUCTION_POOLS[params.pool as keyof typeof PRODUCTION_POOLS]
            )
          : params.pool;

      // Add liquidity using SDK
      const { call } = await addLiquidity({
        pool: poolAddress,
        maxAmountsIn: params.maxAmountsIn,
        minLpTokenMintAmount: params.minLpTokenMintAmount,
        takeSwaps: params.takeSwaps || false,
      });

      // Execute and return transaction signature
      const txSignature = await call.rpc();

      return {
        success: true,
        data: txSignature,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to add liquidity",
          details: error,
        },
      };
    }
  }

  /**
   * Remove liquidity from a Numeraire pool
   */
  static async removeLiquidity(
    connection: Connection,
    keypair: Keypair,
    params: RemoveLiquidityParams
  ): Promise<ServiceResponse<string>> {
    try {
      // Initialize SDK with keypair
      this.initialize(keypair, false, connection);

      // Resolve pool address if a key is provided
      const poolAddress =
        typeof params.pool === "string"
          ? new PublicKey(
              PRODUCTION_POOLS[params.pool as keyof typeof PRODUCTION_POOLS]
            )
          : params.pool;

      // Remove liquidity using SDK
      const { call } = await removeLiquidity({
        pool: poolAddress,
        lpTokenRedeemAmount: params.lpTokenRedeemAmount,
      });

      // Execute and return transaction signature
      const txSignature = await call.rpc();

      return {
        success: true,
        data: txSignature,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to remove liquidity",
          details: error,
        },
      };
    }
  }

  /**
   * Get available pool information from Numeraire
   */
  static getAvailablePools(): ServiceResponse<typeof PRODUCTION_POOLS> {
    try {
      return {
        success: true,
        data: PRODUCTION_POOLS,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to get available pools",
          details: error,
        },
      };
    }
  }
}
