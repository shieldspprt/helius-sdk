/**
 * SolHunt + Helius SDK Integration Example
 *
 * This example shows how to combine Helius SDK data with SolHunt MCP server
 * for comprehensive wallet health analysis and SOL recovery.
 *
 * SolHunt MCP Server: https://solhunt.dev/.netlify/functions/mcp
 * Repository: https://github.com/shieldspprt/solhunt-recovery
 */

import { Helius } from "../../src/index.js";

// Initialize Helius with your API key
const helius = new Helius("YOUR_HELIUS_API_KEY");

/**
 * Step 1: Get wallet overview using Helius
 * Step 2: Use SolHunt MCP for recovery analysis
 */
async function analyzeWalletForRecovery(walletAddress: string) {
  try {
    // Get native SOL balance and token accounts from Helius
    const balances = await helius.rpc.getTokenAccounts({
      ownerAddress: walletAddress,
    });

    const solBalance = await helius.rpc.getBalance(walletAddress);

    console.log("=== Helius Wallet Data ===");
    console.log(`SOL Balance: ${solBalance} lamports`);
    console.log(`Token Accounts: ${balances?.token_accounts?.length || 0}`);

    // Now call SolHunt MCP for recovery analysis
    // This would typically be done via MCP client
    console.log("\n=== SolHunt MCP Integration ===");
    console.log(`Call SolHunt MCP at: https://solhunt.dev/.netlify/functions/mcp`);
    console.log(`Tool: check_wallet_health`);
    console.log(`Args: { wallet_address: "${walletAddress}" }`);

    // Example MCP call structure:
    const solhuntRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "check_wallet_health",
        arguments: {
          wallet_address: walletAddress,
        },
      },
    };

    console.log("\nRequest payload:", JSON.stringify(solhuntRequest, null, 2));

    return {
      heliusData: {
        solBalance,
        tokenAccounts: balances?.token_accounts?.length || 0,
      },
      solhuntEndpoint: "https://solhunt.dev/.netlify/functions/mcp",
      recommendedTools: [
        "check_wallet_health",
        "get_recovery_opportunities",
        "preview_recovery",
      ],
    };
  } catch (error) {
    console.error("Error analyzing wallet:", error);
    throw error;
  }
}

/**
 * Example: Full wallet recovery workflow
 */
async function fullRecoveryWorkflow(walletAddress: string) {
  // 1. Analyze with Helius
  const heliusData = await helius.rpc.getAssetsByOwner({
    ownerAddress: walletAddress,
  });

  console.log(`Found ${heliusData.items.length} assets via Helius DAS API`);

  // 2. Get recovery opportunities via SolHunt MCP
  console.log("\nNext steps with SolHunt MCP:");
  console.log("1. Call 'check_wallet_health' for health score");
  console.log("2. Call 'get_recovery_opportunities' for actionable list");
  console.log("3. Call 'preview_recovery' to see exact SOL amounts");
  console.log("4. Call 'build_recovery_transaction' for unsigned tx");

  return {
    assets: heliusData.items,
    solhuntWorkflow: [
      "check_wallet_health",
      "get_recovery_opportunities",
      "preview_recovery",
      "build_recovery_transaction",
    ],
  };
}

// Run examples if executed directly
if (require.main === module) {
  const walletAddress = process.argv[2] || "YourWalletAddressHere";

  console.log("SolHunt + Helius Integration Example\n");
  console.log(`Analyzing wallet: ${walletAddress}\n`);

  analyzeWalletForRecovery(walletAddress)
    .then((result) => {
      console.log("\n=== Analysis Complete ===");
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(console.error);
}

export { analyzeWalletForRecovery, fullRecoveryWorkflow };
