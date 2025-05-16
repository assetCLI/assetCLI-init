// import { Command } from "commander";
// import { ConfigService } from "../services/config-service";
// import { NETWORK_MAP } from "../utils/constants";
// import { displayConfig } from "../mcp/config-and-wallet";

// export const configCommand = new Command("config")
//   .description("Manage configuration settings")
//   .addCommand(
//     new Command("show")
//       .description("Show current configuration")
//       .action(async () => {
//         await displayConfig();
//       })
//   )
//   .addCommand(
//     new Command("set-network")
//       .description("Set the network configuration")
//       .argument("<network>", "Network name (mainnet, devnet, testnet) or custom")
//       .option("-u, --url <url>", "Custom RPC URL (required for custom network)")
//       .action(async (network: string, options: { url?: string }) => {
//         if (!NETWORK_MAP[network] && !options.url) {
//           console.error("Error: Custom RPC URL is required for custom networks");
//           process.exit(1);
//         }

//         const response = await ConfigService.setNetwork(network, options.url);
//         if (!response.success) {
//           console.error("Error:", response.error?.message);
//           process.exit(1);
//         }

//         console.log(`Network set to ${network}`);
//         if (options.url) {
//           console.log(`Custom RPC URL: ${options.url}`);
//         }
//       })
//   )
//   .addCommand(
//     new Command("reset")
//       .description("Reset configuration to defaults")
//       .action(async () => {
//         const response = await ConfigService.resetConfig();
//         if (!response.success) {
//           console.error("Error:", response.error?.message);
//           process.exit(1);
//         }
//         console.log("Configuration reset to defaults");
//       })
//   );
