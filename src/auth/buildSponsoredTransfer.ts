import {
  createSolanaRpc,
  createKeyPairSignerFromBytes,
  address as toAddress,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  partiallySignTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  type Instruction,
} from "@solana/kit";
import {
  getTransferInstruction,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { USDC_MINT, RPC_URL, MEMO_PROGRAM_ID } from "./constants";

/**
 * Build a partially signed USDC transfer transaction where the
 * sponsor (not the user) pays the SOL transaction fee.
 * The user signs only the transfer authority and memo instructions.
 */
export async function buildSponsoredTransfer(
  secretKey: Uint8Array,
  sponsorAddress: string,
  recipientAddress: string,
  amount: bigint,
  memo: string
): Promise<string> {
  const rpc = createSolanaRpc(RPC_URL);
  const signer = await createKeyPairSignerFromBytes(secretKey);

  const [senderAta] = await findAssociatedTokenPda({
    owner: signer.address,
    mint: USDC_MINT,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const [receiverAta] = await findAssociatedTokenPda({
    owner: toAddress(recipientAddress),
    mint: USDC_MINT,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const transferIx = getTransferInstruction({
    source: senderAta,
    destination: receiverAta,
    authority: signer,
    amount,
  });

  const memoIx: Instruction = {
    programAddress: MEMO_PROGRAM_ID,
    accounts: [{ address: signer.address, role: 3 /* READONLY_SIGNER */ }],
    data: new TextEncoder().encode(memo),
  };

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(toAddress(sponsorAddress), tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions([transferIx, memoIx], tx)
  );

  const partiallySigned =
    await partiallySignTransactionMessageWithSigners(transactionMessage);

  return getBase64EncodedWireTransaction(partiallySigned);
}
