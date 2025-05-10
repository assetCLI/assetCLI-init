import fs from "fs-extra";
import {
  CONFIG_PATH,
  CONFIG_DIR,
  DEFAULT_NETWORK,
  NETWORK_MAP,
} from "../utils/constants";
import { Config, NetworkConfig } from "../types";
import { ServiceResponse } from "../types/service-types";

export class ConfigService {
  static async getConfig(): Promise<ServiceResponse<Config>> {
    try {
      await fs.ensureDir(CONFIG_DIR);

      if (!fs.existsSync(CONFIG_PATH)) {
        const defaultConfig: Config = {
          network: DEFAULT_NETWORK
        };
        await fs.writeJSON(CONFIG_PATH, defaultConfig, { spaces: 2 });
        return { success: true, data: defaultConfig };
      }

      const config = (await fs.readJSON(CONFIG_PATH)) as Config;
      return { success: true, data: config };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to load configuration",
          details: error,
        },
      };
    }
  }

  static async saveConfig(config: Config): Promise<ServiceResponse<void>> {
    try {
      await fs.ensureDir(CONFIG_DIR);
      await fs.writeJSON(CONFIG_PATH, config, { spaces: 2 });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to save configuration",
          details: error,
        },
      };
    }
  }

  static async setNetwork(
    networkName: string,
    customRpcUrl?: string
  ): Promise<ServiceResponse<Config>> {
    try {
      const configResponse = await this.getConfig();
      if (!configResponse.success || !configResponse.data) {
        return configResponse;
      }

      const config = configResponse.data;
      const networkConfig =
        NETWORK_MAP[networkName as keyof typeof NETWORK_MAP] || {
          name: networkName,
          rpcUrl: customRpcUrl || DEFAULT_NETWORK.rpcUrl,
        };

      config.network = networkConfig;

      const saveResponse = await this.saveConfig(config);
      if (!saveResponse.success) {
        return {
          success: false,
          error: {
            message: "Failed to update network config",
            details: saveResponse.error,
          },
          data: config,
        };
      }

      return { success: true, data: config };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to update network config",
          details: error,
        },
      };
    }
  }

  static async resetConfig(): Promise<ServiceResponse<void>> {
    try {
      await fs.remove(CONFIG_PATH);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to reset configuration",
          details: error,
        },
      };
    }
  }

  static async setActiveSquadsMultisig(
    multisigAddress: string
  ): Promise<ServiceResponse<Config>> {
    try {
      const configResponse = await this.getConfig();
      if (!configResponse.success || !configResponse.data) {
        return configResponse;
      }

      const config = configResponse.data;
      // Initialize squadsMultisig if it doesn't exist
      if (!config.squadsMultisig) {
        config.squadsMultisig = {};
      }

      config.squadsMultisig.activeAddress = multisigAddress;

      const saveResponse = await this.saveConfig(config);
      if (!saveResponse.success) {
        return {
          success: false,
          error: {
            message: "Failed to set active Squads multisig",
            details: saveResponse.error,
          },
          data: config,
        };
      }

      return { success: true, data: config };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to set active Squads multisig",
          details: error,
        },
      };
    }
  }

  static async getActiveSquadsMultisig(): Promise<ServiceResponse<string | undefined>> {
    try {
      const configResponse = await this.getConfig();
      if (!configResponse.success || !configResponse.data) {
        return configResponse.data?.squadsMultisig?.activeAddress
          ? {
              success: true,
              data: configResponse.data.squadsMultisig.activeAddress,
            }
          : {
              success: false,
              error: { message: "No active Squads multisig found" },
            };
      }

      const config = configResponse.data;
      return {
        success: true,
        data: config.squadsMultisig?.activeAddress,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: "Failed to get active Squads multisig",
          details: error,
        },
      };
    }
  }
}
