import fs from "fs-extra";
import {
  CONFIG_PATH,
  CONFIG_DIR,
  DEFAULT_CLUSTER,
  ENDPOINT_MAP,
} from "../utils/constants";
import { Config, DaoConfig } from "../types";
import { Cluster } from "@solana/web3.js";
import { ServiceResponse } from "../types/service-types";

export class ConfigService {
  static async getConfig(): Promise<ServiceResponse<Config>> {
    try {
      await fs.ensureDir(CONFIG_DIR);

      if (!fs.existsSync(CONFIG_PATH)) {
        const defaultConfig: Config = {
          dao: {
            cluster: DEFAULT_CLUSTER as Cluster,
            endpoint: ENDPOINT_MAP[DEFAULT_CLUSTER as Cluster],
          },
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

  static async updateDaoConfig(
    daoConfig: Partial<DaoConfig>
  ): Promise<ServiceResponse<Config>> {
    try {
      const configResponse = await this.getConfig();
      if (!configResponse.success || !configResponse.data) {
        return configResponse;
      }

      const config = configResponse.data;
      config.dao = {
        ...config.dao,
        ...daoConfig,
      } as DaoConfig;

      const saveResponse = await this.saveConfig(config);
      if (!saveResponse.success) {
        return {
          success: false,
          error: {
            message: "Failed to update DAO config",
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
          message: "Failed to update DAO config",
          details: error,
        },
      };
    }
  }

  static async setActiveRealm(
    realmAddress: string
  ): Promise<ServiceResponse<Config>> {
    try {
      const configResponse = await this.getConfig();
      if (!configResponse.success || !configResponse.data) {
        return configResponse;
      }

      const config = configResponse.data;
      config.dao = {
        ...config.dao,
        activeRealm: realmAddress,
      } as DaoConfig;

      const saveResponse = await this.saveConfig(config);
      if (!saveResponse.success) {
        return {
          success: false,
          error: {
            message: "Failed to set active realm",
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
          message: "Failed to set active realm",
          details: error,
        },
      };
    }
  }

  static async setCluster(
    cluster: Cluster,
    endpoint?: string
  ): Promise<ServiceResponse<Config>> {
    const effectiveEndpoint = endpoint || ENDPOINT_MAP[cluster];
    return this.updateDaoConfig({
      cluster,
      endpoint: effectiveEndpoint,
    });
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

  static async getActiveSquadsMultisig(): Promise<
    ServiceResponse<string | undefined>
  > {
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
