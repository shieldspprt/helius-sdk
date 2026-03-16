import { payPaymentIntent } from "../checkout";
import { checkSolBalance, checkUsdcBalance } from "../checkBalances";
import { payWithMemo } from "../payWithMemo";
import { loadKeypair } from "../loadKeypair";
import { getAddress } from "../getAddress";
import { paySponsoredIntent } from "../sponsoredPayment";

jest.mock("../checkBalances");
jest.mock("../payWithMemo");
jest.mock("../loadKeypair");
jest.mock("../getAddress");
jest.mock("../sponsoredPayment");

const mockCheckSolBalance = checkSolBalance as jest.MockedFunction<
  typeof checkSolBalance
>;
const mockCheckUsdcBalance = checkUsdcBalance as jest.MockedFunction<
  typeof checkUsdcBalance
>;
const mockPayWithMemo = payWithMemo as jest.MockedFunction<typeof payWithMemo>;
const mockLoadKeypair = loadKeypair as jest.MockedFunction<typeof loadKeypair>;
const mockGetAddress = getAddress as jest.MockedFunction<typeof getAddress>;
const mockPaySponsoredIntent = paySponsoredIntent as jest.MockedFunction<
  typeof paySponsoredIntent
>;

const mockSecretKey = new Uint8Array(64).fill(1);

const BASE_INTENT = {
  id: "pi_test",
  status: "pending" as const,
  destinationWallet: "Treasury111",
  amount: 4900,
  solanaPayUrl: "solana:...",
  expiresAt: "2026-01-01T00:00:00Z",
  createdAt: "2025-12-01T00:00:00Z",
  priceId: "price_stg_EZrAwZiew077g1qd",
  refId: "ref-1",
};

describe("payPaymentIntent", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockLoadKeypair.mockReturnValue({
      publicKey: new Uint8Array(32),
      secretKey: mockSecretKey,
    });
    mockGetAddress.mockResolvedValue("WalletAddress111");
    mockCheckSolBalance.mockResolvedValue(10_000_000n);
    mockCheckUsdcBalance.mockResolvedValue(50_000_000n);
    mockPayWithMemo.mockResolvedValue("tx-sig-123");
  });

  // ── Self-funded (default) ──

  it("returns empty string for $0 amount", async () => {
    const result = await payPaymentIntent(mockSecretKey, {
      ...BASE_INTENT,
      amount: 0,
    });
    expect(result).toBe("");
    expect(mockPayWithMemo).not.toHaveBeenCalled();
    expect(mockCheckSolBalance).not.toHaveBeenCalled();
  });

  it("sends correct amount: cents * 10_000 = USDC raw", async () => {
    await payPaymentIntent(mockSecretKey, BASE_INTENT);

    expect(mockPayWithMemo).toHaveBeenCalledWith(
      mockSecretKey,
      "Treasury111",
      49_000_000n, // 4900 * 10_000
      "pi_test" // memo = intent.id
    );
  });

  it("uses intent.id as memo", async () => {
    await payPaymentIntent(mockSecretKey, {
      ...BASE_INTENT,
      id: "pi_custom_memo",
    });

    expect(mockPayWithMemo).toHaveBeenCalledWith(
      mockSecretKey,
      "Treasury111",
      49_000_000n,
      "pi_custom_memo"
    );
  });

  it("throws on insufficient SOL", async () => {
    mockCheckSolBalance.mockResolvedValue(100n);

    await expect(payPaymentIntent(mockSecretKey, BASE_INTENT)).rejects.toThrow(
      "Insufficient SOL"
    );
  });

  it("throws on insufficient USDC with amount in USDC not cents", async () => {
    mockCheckUsdcBalance.mockResolvedValue(1_000_000n); // 1 USDC

    await expect(payPaymentIntent(mockSecretKey, BASE_INTENT)).rejects.toThrow(
      "need: 49 USDC"
    );
  });

  it("handles large amounts correctly", async () => {
    mockCheckUsdcBalance.mockResolvedValue(1_000_000_000n); // 1000 USDC
    const intent = { ...BASE_INTENT, amount: 99900 }; // $999

    await payPaymentIntent(mockSecretKey, intent);

    expect(mockPayWithMemo).toHaveBeenCalledWith(
      mockSecretKey,
      "Treasury111",
      999_000_000n, // 99900 * 10_000
      "pi_test"
    );
  });

  it("defaults to self_funded when paymentMode not specified", async () => {
    await payPaymentIntent(mockSecretKey, BASE_INTENT);

    expect(mockCheckSolBalance).toHaveBeenCalled();
    expect(mockPayWithMemo).toHaveBeenCalled();
    expect(mockPaySponsoredIntent).not.toHaveBeenCalled();
  });

  it("uses self_funded when explicitly specified", async () => {
    await payPaymentIntent(mockSecretKey, BASE_INTENT, "self_funded");

    expect(mockCheckSolBalance).toHaveBeenCalled();
    expect(mockPayWithMemo).toHaveBeenCalled();
  });

  // ── Sponsored ──

  describe("sponsored mode", () => {
    const SPONSORED_INTENT = {
      ...BASE_INTENT,
      actualPayerWallet: "SponsorWallet111",
    };

    beforeEach(() => {
      mockPaySponsoredIntent.mockResolvedValue("tx-sponsored-sig");
    });

    it("delegates to paySponsoredIntent", async () => {
      const result = await payPaymentIntent(
        mockSecretKey,
        SPONSORED_INTENT,
        "sponsored",
        "jwt-123",
        "test-agent"
      );

      expect(mockPaySponsoredIntent).toHaveBeenCalledWith(
        mockSecretKey,
        SPONSORED_INTENT,
        "jwt-123",
        "test-agent"
      );
      expect(result).toBe("tx-sponsored-sig");
    });

    it("does not call self-funded functions", async () => {
      await payPaymentIntent(
        mockSecretKey,
        SPONSORED_INTENT,
        "sponsored",
        "jwt-123"
      );

      expect(mockCheckSolBalance).not.toHaveBeenCalled();
      expect(mockPayWithMemo).not.toHaveBeenCalled();
    });

    it("throws when JWT is missing for sponsored mode", async () => {
      await expect(
        payPaymentIntent(mockSecretKey, SPONSORED_INTENT, "sponsored")
      ).rejects.toThrow("JWT is required");
    });

    it("returns empty string for $0 amount in sponsored mode", async () => {
      const result = await payPaymentIntent(
        mockSecretKey,
        { ...SPONSORED_INTENT, amount: 0 },
        "sponsored",
        "jwt-123"
      );

      expect(result).toBe("");
      expect(mockPaySponsoredIntent).not.toHaveBeenCalled();
    });
  });
});
