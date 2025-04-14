import { Connection, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";

export async function getSolanaTimestamp(
  connection: Connection
): Promise<number> {
  const clockAccountInfo = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  if (!clockAccountInfo) throw new Error("Failed to fetch clock sysvar");

  // Decode the Clock sysvar
  const data = clockAccountInfo.data;
  const unixTimestamp = data.readBigInt64LE(8); // Offset 8 is where the timestamp starts

  return Number(unixTimestamp); // Convert BigInt to number
}
