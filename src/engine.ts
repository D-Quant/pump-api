import {AnchorProvider, BN, Program, Wallet} from "@coral-xyz/anchor";

import {
    Commitment,
    ComputeBudgetProgram,
    Connection,
    PublicKey,
    SystemProgram,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js";
import {genKeyPair} from "./helpers/wallet_help";
import {PumpFun, PumpFunIdl} from "./constants/idl";
import {ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, TOKEN_PROGRAM_ID,} from "@solana/spl-token";
import {
    BONDING_CURVE_SEED,
    BondingCurveAccount,
    calculateWithSlippageBuy,
    COMMITMENT_LEVEL,
    FEE_RECIPIENT,
    GLOBAL_ACCOUNT_SEED,
    GlobalAccount,
    logger,
    NETWORK,
    PROGRAM_ID,
} from "./helpers";
import {TransactionExecutor} from "./transactions/transaction-executor.interface";
import {JitoTransactionExecutor} from "./transactions/jito-rpc-transaction-executor";
import {DefaultTransactionExecutorV2} from "./transactions/default-transaction-executorV2";

export class PumpEngine {
    private readonly program: Program<PumpFun>;
    private readonly wallet: Wallet;
    private readonly provider: AnchorProvider;
    private readonly maxSellRetries: number
    private readonly connection: Connection

    constructor(private readonly rpc_endpoint: string,
                private readonly owner_private_key: string) {
        // 节点连接
        const connection = new Connection(rpc_endpoint, {
            commitment: COMMITMENT_LEVEL,
        });
        // 钱包密钥对
        const kp = genKeyPair(owner_private_key)
        // Anchor Wallet
        const wallet: Wallet = new Wallet(kp);
        // AnchorProvider
        const provider = new AnchorProvider(connection, wallet, {
            commitment: COMMITMENT_LEVEL,
        });
        const program = new Program(
            PumpFunIdl,
            PROGRAM_ID,
            provider
        ) as Program<PumpFun>;
        //
        this.connection = connection
        this.program = program;
        this.wallet = wallet;
        this.provider = provider;
        this.maxSellRetries = 10
    }

    //买入操作
    public async buy(mint: PublicKey,
                     buyAmount: string,
                     executor: string,
                     unitPrice: number = 13646642,
                     unitLimit: number = 66000,
                     custom_fee: string = "0.0009") {

        let buyAmountSol = BigInt("");//todo fix

        const slippageBasisPoints: bigint = 500n;
        const buyAmountWithSlippage = calculateWithSlippageBuy(
            buyAmountSol,
            slippageBasisPoints
        );

        const associatedBondingCurve = await getAssociatedTokenAddress(
            mint,
            this.getBondingCurvePDA(mint),
            true
        );
        const associatedUser = await getAssociatedTokenAddress(
            mint,
            this.wallet.publicKey,
            false
        );
        const [globalAccountPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from(GLOBAL_ACCOUNT_SEED)],
            new PublicKey(this.program.programId)
        );
        let instructions = [];
        const bondingCurve = this.getBondingCurvePDA(mint);

        let buyInstruction = await this.program.methods
            .buy(
                new BN(buyAmount.toString()),
                new BN(buyAmountWithSlippage.toString())
            )
            .accounts({
                feeRecipient: FEE_RECIPIENT,
                mint,
                associatedBondingCurve,
                associatedUser,
                user: this.wallet.publicKey,
                global: globalAccountPDA,
                bondingCurve: bondingCurve,
                program: this.program.programId,
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([this.wallet.payer])
            .instruction();

        instructions.push(buyInstruction);

        const latestBlockhash = await this.connection.getLatestBlockhash();
        const isJito = executor === 'jito';

        let messageV0 = new TransactionMessage({
            payerKey: this.wallet.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [
                ...(isJito
                    ? []
                    : [
                        ComputeBudgetProgram.setComputeUnitPrice({
                            microLamports: unitPrice,
                        }),
                        ComputeBudgetProgram.setComputeUnitLimit({
                            units: unitLimit,
                        }),
                    ]),
                ...instructions,
            ],
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);

        transaction.sign([this.wallet.payer]);
        const exec = this.switchTxExecutor('default', custom_fee);

        const result = await exec.executeAndConfirm(
            transaction,
            this.wallet.payer,
            latestBlockhash
        );

        if (result.confirmed) {
            logger.info(
                {
                    mint: mint.toString(),
                    signature: result.signature,
                    url: `https://solscan.io/tx/${result.signature}?cluster=${NETWORK}`,
                },
                `Confirmed buy tx,${+new Date()}`
            );
        } else {
            logger.info(
                {
                    mint: mint.toString(),
                    signature: result.signature,
                    error: result.error,
                },
                `Error confirming buy tx`
            );
        }
        return result;
    }

    // 卖出操作
    public async sell(mint: PublicKey,
                      sellAmount: string,
                      executor: string,
                      unitPrice: number = 13646642,
                      unitLimit: number = 66000,
                      custom_fee: string = "0.0009") {
        const associatedBondingCurve = await getAssociatedTokenAddress(
            mint,
            this.getBondingCurvePDA(mint),
            true
        );
        const associatedUser = await getAssociatedTokenAddress(
            mint,
            this.wallet.publicKey,
            false
        );
        const [globalAccountPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from(GLOBAL_ACCOUNT_SEED)],
            new PublicKey(PROGRAM_ID)
        );
        const bondingCurve = this.getBondingCurvePDA(mint);

        let bondingCurveAccount = await this.getBondingCurveAccount(bondingCurve);
        if (!bondingCurveAccount) {
            logger.info({mint: mint.toString()}, `Bonding curve account not found`);
            return;
        }
        let globalAccount = await this.getGlobalAccount();


        let minSolOutput = bondingCurveAccount.getSellPrice(
            BigInt(sellAmount),
            globalAccount.feeBasisPoints
        );
        //执行指令
        let sellInstruction = await this.program.methods
            .sell(new BN(sellAmount.toString()), new BN(minSolOutput.toString()))
            .accounts({
                global: globalAccountPDA,
                feeRecipient: FEE_RECIPIENT,
                mint,
                bondingCurve,
                associatedBondingCurve,
                associatedUser,
                user: this.wallet.publicKey,
                systemProgram: SystemProgram.programId,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
                program: this.program.programId,
            })
            .instruction();

        const latestBlockhash = await this.connection.getLatestBlockhash();
        const isJito = executor === 'jito';
        let messageV0 = new TransactionMessage({
            payerKey: this.wallet.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [
                ...(isJito
                    ? []
                    : [
                        ComputeBudgetProgram.setComputeUnitPrice({
                            microLamports: unitPrice,
                        }),
                        ComputeBudgetProgram.setComputeUnitLimit({
                            units: unitLimit,
                        }),
                    ]),
                sellInstruction,
                // TODO: close account
            ],
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);
        transaction.sign([this.wallet.payer]);
        const exec = this.switchTxExecutor('default', custom_fee);
        const result = await exec.executeAndConfirm(
            transaction,
            this.wallet.payer,
            latestBlockhash
        );

        if (result.confirmed) {
            logger.info(
                {
                    mint: mint.toString(),
                    signature: result.signature,
                    url: `https://solscan.io/tx/${result.signature}?cluster=${NETWORK}`,
                },
                `Confirmed sell tx`
            );
        } else {
            logger.info(
                {
                    mint: mint.toString(),
                    signature: result.signature,
                    error: result.error,
                },
                `Error confirming sell tx`
            );
        }
        return result;
    }

    private getBondingCurvePDA(mint: PublicKey): PublicKey {
        return PublicKey.findProgramAddressSync(
            [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
            this.program.programId
        )[0];
    }


    private async getGlobalAccount(commitment: Commitment = COMMITMENT_LEVEL) {
        const [globalAccountPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from(GLOBAL_ACCOUNT_SEED)],
            new PublicKey(PROGRAM_ID)
        );

        const tokenAccount = await this.provider.connection.getAccountInfo(
            globalAccountPDA,
            commitment
        );

        return GlobalAccount.fromBuffer(tokenAccount!.data);
    }

    public async getPoolInfo(mint_pk: string) {
        const mint = new PublicKey(mint_pk)
        const bondingCurve = this.getBondingCurvePDA(mint);
        return await this.getBondingCurveAccount(bondingCurve);
    }

    private async getBondingCurveAccount(bondingCurve: PublicKey) {
        const tokenAccount = await this.provider.connection.getAccountInfo(
            bondingCurve,
            COMMITMENT_LEVEL
        );
        if (!tokenAccount) {
            return null;
        }
        return BondingCurveAccount.fromBuffer(tokenAccount!.data);
    }

    // 选择交易执行器
    private switchTxExecutor(executor: string | undefined, custom_fee: string = "0.000995"): TransactionExecutor {
        let txExecutor: TransactionExecutor;

        switch (executor) {
            case "jito": {
                txExecutor = new JitoTransactionExecutor(custom_fee, this.connection);//todo fix
                return txExecutor
            }
            default: {
                txExecutor = new DefaultTransactionExecutorV2(this.connection);
                return txExecutor
            }
        }
    }


}