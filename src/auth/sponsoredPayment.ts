import { authRequest } from "./utils";
import { loadKeypair } from "./loadKeypair";
import { getAddress } from "./getAddress";
import { checkUsdcBalance } from "./checkBalances";
import { buildSponsoredTransfer } from "./buildSponsoredTransfer";
import type { CheckoutInitializeResponse } from "./types";

interface SponsorSubmitResponse {
  txSignature: string;
}

/**
 * Submit a partially signed transaction to the backend sponsor endpoint.
 * The backend adds the fee-payer signature and broadcasts.
 */
export async function submitSponsoredPayment(
  jwt: string,
  intent: CheckoutInitializeResponse,
  serializedTransaction: string,
  userAgent?: string
): Promise<string> {
  const response = await authRequest<SponsorSubmitResponse>(
    `/checkout/${intent.id}/sponsor-submit`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ transaction: serializedTransaction }),
    },
    userAgent
  );
  return response.txSignature;
}

/**
 * Full sponsored payment flow: validate USDC balance, build partially signed tx,
 * submit to backend sponsor endpoint. Skips SOL balance check.
 */
export async function paySponsoredIntent(
  secretKey: Uint8Array,
  intent: CheckoutInitializeResponse,
  jwt: string,
  userAgent?: string
): Promise<string> {
  const sponsorWallet = intent.actualPayerWallet;
  if (!sponsorWallet) {
    throw new Error(
      "Sponsored payment requires actualPayerWallet in the payment intent. " +
        "Ensure the checkout was initialized with paymentMode: 'sponsored'."
    );
  }

  const keypair = loadKeypair(secretKey);
  const walletAddress = await getAddress(keypair);
  const amountRaw = BigInt(intent.amount) * 10_000n;

  const usdcBalance = await checkUsdcBalance(walletAddress);
  if (usdcBalance < amountRaw) {
    throw new Error(
      `Insufficient USDC. Have: ${Number(usdcBalance) / 1_000_000} USDC, need: ${intent.amount / 100} USDC. Fund address: ${walletAddress}`
    );
  }

  const serializedTx = await buildSponsoredTransfer(
    secretKey,
    sponsorWallet,
    intent.destinationWallet,
    amountRaw,
    intent.id
  );

  return submitSponsoredPayment(jwt, intent, serializedTx, userAgent);
}
