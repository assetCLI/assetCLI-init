import { Connection, Commitment, Cluster } from "@solana/web3.js";
import { ConfigService } from "./config-service";
import {
  ENDPOINT_MAP,
  DEFAULT_CLUSTER,
  ENDPOINT_LOCALHOST,
} from "../utils/constants";
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
        !configResponse.data.dao?.endpoint
      ) {
        // Fall back to default connection
        const connection = new Connection(
          ENDPOINT_MAP[DEFAULT_CLUSTER],
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
        configResponse.data.dao.endpoint,
        commitment
      );

      // Test the connection by making a simple call
      try {
        await connection.getVersion();
        return { success: true, data: connection };
      } catch (error) {
        // Fallback to default connection if connection fails
        const fallbackConnection = new Connection(
          ENDPOINT_MAP[DEFAULT_CLUSTER],
          commitment
        );
        return {
          success: true,
          data: fallbackConnection,
          error: {
            message: `Connection to ${configResponse.data.dao.endpoint} failed, using default`,
            details: error,
          },
        };
      }
    } catch (error) {
      // In case of any other errors, return a fallback connection
      return {
        success: true,
        data: new Connection(ENDPOINT_MAP[DEFAULT_CLUSTER], commitment),
        error: {
          message: "Failed to create connection from config, using default",
          details: error,
        },
      };
    }
  }

  static async getCluster(): Promise<ServiceResponse<string>> {
    try {
      const configResponse = await ConfigService.getConfig();
      if (!configResponse.success || !configResponse.data?.dao?.endpoint) {
        return {
          success: true,
          data: DEFAULT_CLUSTER,
          error: { message: "Endpoint not found, default cluster used" },
        };
      }
      const endpoint = configResponse.data.dao.endpoint;
      let clusterName = DEFAULT_CLUSTER;
      for (const [cluster, url] of Object.entries(ENDPOINT_MAP)) {
        if (url === endpoint) {
          clusterName = cluster as Cluster;
          break;
        }
      }
      return { success: true, data: clusterName };
    } catch (error) {
      return {
        success: false,
        error: { message: "Failed to retrieve cluster information", details: error },
      };
    }
  }
}
