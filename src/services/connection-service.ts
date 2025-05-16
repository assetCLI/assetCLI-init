import { Connection, Commitment, Cluster } from "@solana/web3.js";
import { ConfigService } from "./config-service";
import { DEFAULT_NETWORK } from "../utils/constants";
import { ServiceResponse } from "../types/service-types";

export class ConnectionService {
  static async getConnection(
    commitment: Commitment = "confirmed"
  ): Promise<ServiceResponse<Connection>> {
    try {
      const configResponse = await ConfigService.getConfig();

      if (
        !configResponse.success ||
        !configResponse.data ||
        !configResponse.data.network?.rpcUrl
      ) {
        // Fall back to default connection
        const connection = new Connection(
          DEFAULT_NETWORK.rpcUrl,
          commitment
        );
        return {
          success: true,
          data: connection,
          error: {
            message: "Using default connection due to missing configuration",
          },
        };
      }

      // Create the connection
      const connection = new Connection(
        configResponse.data.network.rpcUrl,
        commitment
      );

      // Test the connection by making a simple call
      try {
        await connection.getVersion();
        return { success: true, data: connection };
      } catch (error) {
        // Fallback to default connection if connection fails
        const fallbackConnection = new Connection(
          DEFAULT_NETWORK.rpcUrl,
          commitment
        );
        return {
          success: true,
          data: fallbackConnection,
          error: {
            message: `Connection to ${configResponse.data.network.rpcUrl} failed, using default`,
            details: error,
          },
        };
      }
    } catch (error) {
      // In case of any other errors, return a fallback connection
      return {
        success: true,
        data: new Connection(DEFAULT_NETWORK.rpcUrl, commitment),
        error: {
          message: "Failed to create connection from config, using default",
          details: error,
        },
      };
    }
  }

}
