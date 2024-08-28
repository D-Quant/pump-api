import {
  BlockhashWithExpiryBlockHeight,
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import { TransactionExecutor } from './transaction-executor.interface';
import { logger } from '../helpers';
import bs58 from 'bs58';

export class DefaultTransactionExecutorV2 implements TransactionExecutor {
  constructor(private readonly connection: Connection) {}

  public async executeAndConfirm(
    transaction: VersionedTransaction,
    payer: Keypair,
    latestBlockhash: BlockhashWithExpiryBlockHeight & { slot: string },
  ): Promise<{ confirmed: boolean; signature?: string; error?: string }> {
    logger.debug(latestBlockhash, `${new Date().toISOString()} Executing transaction...`);

    let txSignature = null;
    let confirmTransactionPromise = null;
    let confirmedTx: {
      confirmed: boolean;
      signature: string;
    } | null = null;

    const signatureRaw = transaction.signatures[0];
    txSignature = bs58.encode(signatureRaw);
    let txSendAttempts = 1;

    try {
      logger.info(`${new Date().toISOString()} Subscribing to transaction confirmation`);
      confirmTransactionPromise = this.confirm(txSignature, latestBlockhash);
      logger.info(`${new Date().toISOString()} Sending Transaction ${txSignature}`);
      await this.execute(transaction);

      while (!confirmedTx) {
        confirmedTx = await Promise.race([
          confirmTransactionPromise,
          new Promise<null>((resolve) => setTimeout(resolve, 250)),
        ]);

        if (confirmedTx) {
          break;
        }

        console.log(`${new Date().toISOString()} Tx not confirmed after ${250 * txSendAttempts++}ms, resending`);

        await this.execute(transaction);
      }
    } catch (error) {
      logger.error(`${new Date().toISOString()} Error sending transaction: ${error}`);
    }

    console.log('confirmedTx', confirmedTx);

    if (!confirmedTx) {
      logger.info(`${new Date().toISOString()} Transaction failed`);
      return { confirmed: false, signature: txSignature };
    }

    logger.info(`${new Date().toISOString()} Transaction successful`);
    return { confirmed: true, signature: txSignature };
  }

  private async execute(transaction: Transaction | VersionedTransaction) {
    return this.connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      preflightCommitment: 'processed',
      maxRetries: 0,
    });
  }

  private async confirm(signature: string, latestBlockhash: BlockhashWithExpiryBlockHeight) {
    const confirmation = await this.connection.confirmTransaction(
      {
        signature,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        blockhash: latestBlockhash.blockhash,
      },
      this.connection.commitment,
    );

    return { confirmed: !confirmation.value.err, signature };
  }
}
