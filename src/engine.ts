import {AnchorProvider, BN, Program, Wallet} from "@coral-xyz/anchor";

import {
    Commitment,
    ComputeBudgetProgram,
    Connection,
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction
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
    }

    /**
     * 获取池子账户信息
     * @param mint_pk pump代币的mint账户地址
     */
    public async getPoolInfo(mint_pk: string) {
        const mint = new PublicKey(mint_pk)
        const bondingCurve = this.getBondingCurvePDA(mint);
        return await this.getBondingCurveAccount(bondingCurve);
    }


    /**
     *
     * @param mint_pk pump token mint地址
     * @param sol_input 输入的sol数量，交易金额
     * @param slippage 滑点，默认5%
     * @param unitPrice 计算单元价格
     * @param unitLimit 计算单元限制
     * @param jito 是否使用jito交易执行
     * @param custom_fee 如果采用jito，那么自定义小费
     */
    public async buy(mint_pk: string,
                     sol_input: string,
                     slippage: string = '0.05',
                     unitPrice: number = 13646642,
                     unitLimit: number = 66000,
                     jito: boolean = false,
                     custom_fee: string = "0.0009") {
        logger.info(`BUY POST=> sol_input:${sol_input} slippage:${slippage},unitPrice:${unitPrice},unitLimit:${unitLimit},jito:${jito},custom_fee:${custom_fee}`);
        const mint = new PublicKey(mint_pk);

        let buyAmountSol = this.toSolAmount(sol_input);//计算输入的sol核心数量，精度换算
        //获取pump池子相关信息
        const bondingCurve = this.getBondingCurvePDA(mint);
        let bondingCurveAccount = await this.getBondingCurveAccount(bondingCurve);
        if (!bondingCurveAccount) {
            logger.info({mint: mint.toString()}, `Bonding curve account not found`);
            return;
        }
        // 计算能购买的理论token数量
        let buyAmount = bondingCurveAccount.calSol2TokenAmount(buyAmountSol);

        // 滑点设置
        const slippageBasisPoints = this.toSlippageBasisPoints(slippage);//滑点转化

        // 计算最大付出的sol
        const maxSolCost = calculateWithSlippageBuy(
            buyAmountSol,
            slippageBasisPoints
        );
        logger.info(`buyAmountSol:${buyAmountSol} buyAmount:${buyAmount} slippageBasisPoints:${slippageBasisPoints} maxSolCost:${maxSolCost}`);

        // 2842145.662132
        // 13433344.537188
        // 0.499522221
        const associatedBondingCurve = await getAssociatedTokenAddress(mint, this.getBondingCurvePDA(mint), true);
        const associatedUser = await getAssociatedTokenAddress(mint, this.wallet.publicKey, false);
        const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(GLOBAL_ACCOUNT_SEED)], new PublicKey(this.program.programId));

        // 构建买入指令
        let buyInstruction = await this.program.methods
            .buy(
                new BN(buyAmount.toString()),
                new BN(maxSolCost.toString())
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

        // 交易参数：最近哈希
        const latestBlockhash = await this.connection.getLatestBlockhash();
        // 判断是否采用jito交易

        // 构建交易消息
        let messageV0 = new TransactionMessage({
            payerKey: this.wallet.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [
                ...(jito ? [] : this.genDefaultUnit(unitPrice, unitLimit)),
                buyInstruction
            ],
        }).compileToV0Message();

        // 构建交易
        const transaction = new VersionedTransaction(messageV0);
        // 签名
        transaction.sign([this.wallet.payer]);
        // 选择执行机器
        const exec = this.switchTxExecutor(jito, custom_fee);
        // 处理结果

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

    // 生成默认gas费设置指令集合
    private genDefaultUnit(unitPrice: number, unitLimit: number): [TransactionInstruction, TransactionInstruction] {
        return [
            ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: unitPrice,
            }),
            ComputeBudgetProgram.setComputeUnitLimit({
                units: unitLimit,
            }),
        ]
    }

    // 卖出操作
    /**
     *
     * @param mint_pk PUMP 代币mint地址
     * @param token_input 输入代币数量，例如0.1,内部进行精度转化
     * @param unitPrice 计算单元价格
     * @param unitLimit 计算单元限制
     * @param jito
     * @param custom_fee 如果采用jito则采用自定义手续费
     */
    public async sell(mint_pk: string,
                      token_input: string,
                      unitPrice: number = 13646642,
                      unitLimit: number = 66000,
                      jito: boolean = false,
                      custom_fee: string = "0.0009") {

        logger.info(`SELL POST=> token_input:${token_input} unitPrice:${unitPrice} unitLimit:${unitLimit} jito:${jito} ${custom_fee}`);
        const mint = new PublicKey(mint_pk);
        const sellAmount = this.toTokenAmount(token_input);
        const associatedBondingCurve = await getAssociatedTokenAddress(mint, this.getBondingCurvePDA(mint), true);
        const associatedUser = await getAssociatedTokenAddress(mint, this.wallet.publicKey, false);
        const [globalAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from(GLOBAL_ACCOUNT_SEED)], new PublicKey(PROGRAM_ID));
        const bondingCurve = this.getBondingCurvePDA(mint);

        let bondingCurveAccount = await this.getBondingCurveAccount(bondingCurve);
        if (!bondingCurveAccount) {
            logger.info({mint: mint.toString()}, `Bonding curve account not found`);
            return;
        }

        let globalAccount = await this.getGlobalAccount();

        // 计算卖出后获得sol的最小值
        let minSolOutput = bondingCurveAccount.calToken2SolAmount(
            sellAmount,
            globalAccount.feeBasisPoints
        );
        logger.info(`sellInstruction => sellAmount:${sellAmount} minSolOutput:${minSolOutput}`);
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
        let messageV0 = new TransactionMessage({
            payerKey: this.wallet.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [
                ...(jito ? [] : this.genDefaultUnit(unitPrice, unitLimit)),
                sellInstruction,
            ],
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);
        transaction.sign([this.wallet.payer]);
        const exec = this.switchTxExecutor(jito, custom_fee);

        const result = await exec.executeAndConfirm(transaction, this.wallet.payer, latestBlockhash);

        if (result.confirmed) {
            logger.info({
                mint: mint.toString(),
                signature: result.signature,
                url: `https://solscan.io/tx/${result.signature}?cluster=${NETWORK}`
            }, `Confirmed sell tx`);
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

    /**
     * 计算派生账户，由token的mint计算出池子账户地址
     * @param mint
     * @private
     */
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

    /***
     * 获取池子地址信息
     * @param bondingCurve
     * @private
     */
    private async getBondingCurveAccount(bondingCurve: PublicKey): Promise<BondingCurveAccount | null> {
        const tokenAccount = await this.provider.connection.getAccountInfo(
            bondingCurve,
            COMMITMENT_LEVEL
        );
        if (!tokenAccount) {
            return null;
        }
        return BondingCurveAccount.fromBuffer(tokenAccount!.data);
    }

    /**
     * 选择交易执行器
     * @param jito 布尔值，true使用jito执行
     * @param custom_fee，自定义手续费如0.0009
     * @private
     */
    private switchTxExecutor(jito: boolean, custom_fee: string = "0.000995"): TransactionExecutor {
        let txExecutor: TransactionExecutor;
        if (jito) {
            logger.info("switch executor Jito");
            txExecutor = new JitoTransactionExecutor(custom_fee, this.connection);//todo fix
            return txExecutor
        } else {
            logger.info("switch executor Default");
            txExecutor = new DefaultTransactionExecutorV2(this.connection);
            return txExecutor
        }
    }

    /**
     * 生成sol数量
     * @param n 可读性数量，例如0.6 sol
     * @private
     */
    private toSolAmount(n: number | string): bigint {
        const numericValue = typeof n === 'string' ? parseFloat(n) : n;
        const result = Math.abs(numericValue) * LAMPORTS_PER_SOL; //sol的默认精度转化
        // 将结果转换为 bigint 类型
        return BigInt(Math.ceil(result));
    }

    /***
     * 生成token 数量
     * @param n 可读性数量，例如 0.6 token
     * @private
     */
    private toTokenAmount(n: number | string): bigint {
        const numericValue = typeof n === 'string' ? parseFloat(n) : n;
        const result = Math.abs(numericValue) * 10 ** 6;//pump的所有代币精度都为6
        return BigInt(Math.ceil(result));
    }

    /**
     * 转化滑点为计算用值，例如0.05 转化为500n
     * @param n 可读性滑点，例如0.05表示5%
     * @private
     */
    private toSlippageBasisPoints(n: number | string): bigint {
        const numericValue = typeof n === 'string' ? parseFloat(n) : n;
        const result = numericValue * 10000;//pump的所有代币精度都为6
        return BigInt(Math.ceil(result));
    }
}