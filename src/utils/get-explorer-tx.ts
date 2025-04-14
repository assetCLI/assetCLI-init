export const getExplorerTx = (txId: string, network: string) => {
  const baseUrl = "https://explorer.solana.com";

  const newNetwork = () => {
    if (network === "mainnet-beta") {
      return "";
    } else if (network === "devnet") {
      return "devnet";
    }
    return "custom";
  };
  return `${baseUrl}/tx/${txId}?cluster=${newNetwork()}`;
};
