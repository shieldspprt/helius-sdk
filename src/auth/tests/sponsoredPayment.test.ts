import {
  submitSponsoredPayment,
  paySponsoredIntent,
} from "../sponsoredPayment";
import { authRequest } from "../utils";
import { checkUsdcBalance } from "../checkBalances";
import { loadKeypair } from "../loadKeypair";
import { getAddress } from "../getAddress";
import { buildSponsoredTransfer } from "../buildSponsoredTransfer";

jest.mock("../utils");
jest.mock("../checkBalances");
jest.mock("../loadKeypair");
jest.mock("../getAddress");
jest.mock("../buildSponsoredTransfer");

const mockAuthRequest = authRequest as jest.MockedFunction<typeof authRequest>;
const mockCheckUsdcBalance = checkUsdcBalance as jest.MockedFunction<
  typeof checkUsdcBalance
>;
const mockLoadKeypair = loadKeypair as jest.MockedFunction<typeof loadKeypair>;
const mockGetAddress = getAddress as jest.MockedFunction<typeof getAddress>;
const mockBuildSponsoredTransfer =
  buildSponsoredTransfer as jest.MockedFunction<typeof buildSponsoredTransfer>;

const MOCK_INTENT = {
  id: "pi_test",
  status: "pending" as const,
  destinationWallet: "Treasury111",
  amount: 4900,
  solanaPayUrl: "solana:...",
  expiresAt: "2026-01-01T00:00:00Z",
  createdAt: "2025-12-01T00:00:00Z",
  priceId: "price_dev_monthly",
  refId: "ref-1",
  actualPayerWallet: "SponsorWallet111",
};

describe("submitSponsoredPayment", () => {
  beforeEach(() => jest.resetAllMocks());

  it("POSTs serialized transaction to sponsor-submit endpoint", async () => {
    mockAuthRequest.mockResolvedValue({ txSignature: "tx-sponsored-sig" });

    const result = await submitSponsoredPayment(
      "jwt-123",
      MOCK_INTENT,
      "base64-serialized-tx",
      "test-agent"
    );

    expect(mockAuthRequest).toHaveBeenCalledWith(
      "/checkout/pi_test/sponsor-submit",
      {
        method: "POST",
        headers: { Authorization: "Bearer jwt-123" },
        body: JSON.stringify({ transaction: "base64-serialized-tx" }),
      },
      "test-agent"
    );
    expect(result).toBe("tx-sponsored-sig");
  });

  it("uses intent.id in the endpoint path", async () => {
    mockAuthRequest.mockResolvedValue({ txSignature: "sig" });

    await submitSponsoredPayment(
      "jwt",
      { ...MOCK_INTENT, id: "pi_custom" },
      "tx-data"
    );

    expect(mockAuthRequest).toHaveBeenCalledWith(
      "/checkout/pi_custom/sponsor-submit",
      expect.any(Object),
      undefined
    );
  });
});

describe("paySponsoredIntent", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockLoadKeypair.mockReturnValue({
      publicKey: new Uint8Array(32),
      secretKey: new Uint8Array(64),
    });
    mockGetAddress.mockResolvedValue("WalletAddress111");
    mockCheckUsdcBalance.mockResolvedValue(50_000_000n);
    mockBuildSponsoredTransfer.mockResolvedValue("mock-base64-tx");
    mockAuthRequest.mockResolvedValue({ txSignature: "tx-sponsored-sig" });
  });

  it("checks USDC balance and submits sponsored payment", async () => {
    const result = await paySponsoredIntent(
      new Uint8Array(64),
      MOCK_INTENT,
      "jwt-123",
      "test-agent"
    );

    expect(mockCheckUsdcBalance).toHaveBeenCalledWith("WalletAddress111");
    expect(mockBuildSponsoredTransfer).toHaveBeenCalledWith(
      new Uint8Array(64),
      "SponsorWallet111",
      "Treasury111",
      49_000_000n,
      "pi_test"
    );
    expect(result).toBe("tx-sponsored-sig");
  });

  it("throws when actualPayerWallet is missing", async () => {
    const intentWithoutSponsor = {
      ...MOCK_INTENT,
      actualPayerWallet: undefined,
    };

    await expect(
      paySponsoredIntent(new Uint8Array(64), intentWithoutSponsor, "jwt")
    ).rejects.toThrow("actualPayerWallet");
  });

  it("throws on insufficient USDC", async () => {
    mockCheckUsdcBalance.mockResolvedValue(1_000_000n);

    await expect(
      paySponsoredIntent(new Uint8Array(64), MOCK_INTENT, "jwt")
    ).rejects.toThrow("Insufficient USDC");
  });

  it("does not check SOL balance", async () => {
    const { checkSolBalance } = require("../checkBalances");

    await paySponsoredIntent(new Uint8Array(64), MOCK_INTENT, "jwt");

    expect(checkSolBalance).not.toHaveBeenCalled();
  });
});
