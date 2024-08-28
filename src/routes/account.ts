// noinspection SpellCheckingInspection

import Router from 'koa-router';
import {sendErrorResponse} from '../helpers/response';
import {connection, owner} from "../config";
import {LAMPORTS_PER_SOL, PublicKey} from '@solana/web3.js';
import {AccountLayout, getAccount, getAssociatedTokenAddress, RawAccount, TOKEN_PROGRAM_ID} from '@solana/spl-token';

const router = new Router();

// 获取当前钱包的地址
router.get('/mywallet', async (ctx) => {
    const pk = owner.publicKey.toString()
    const pkjson = owner.publicKey.toJSON()
    ctx.body = {owner: pk, pkjson: pkjson}
})


// 获取账户的sol余额
router.get('/sol_balance', async (ctx) => {
    // 代查询的账户地址
    const owner_input_pk = ctx.query.owner;
    // 默认本钱包账户地址
    const default_owner_pk = owner.publicKey;
    // 目标查询账户地址
    let target: PublicKey = owner_input_pk ? new PublicKey(owner_input_pk) : default_owner_pk;
    const balance = await connection.getBalance(target);

    ctx.body = {
        ctype: "SOL",
        owner: target.toString(),
        amount: balance.toString(),
        uiAmount: balance / LAMPORTS_PER_SOL,
        decimals: 9,
        isWallet: target.equals(default_owner_pk)
    }
})


router.get('/wsol_balance', async (ctx) => {
    // 代查询的账户地址
    const owner_input_pk = ctx.query.owner;
    // 默认本钱包账户地址
    const default_owner_pk = owner.publicKey;
    // 目标查询账户地址
    let target: PublicKey = owner_input_pk ? new PublicKey(owner_input_pk) : default_owner_pk;

    const wsolMint = new PublicKey('So11111111111111111111111111111111111111112'); // WSOL的Mint地址
    const associatedTokenAddress = await getAssociatedTokenAddress(wsolMint, target);

    try {
        const accountInfo = await getAccount(connection, associatedTokenAddress);
        ctx.body = {
            ctype: "WSOL",
            owner: target.toString(),
            amount: accountInfo.amount.toString(),
            uiAmount: Number(accountInfo.amount) / LAMPORTS_PER_SOL,
            decimals: 9,
            isWallet: target.equals(default_owner_pk)
        }
    } catch (error) {
        sendErrorResponse(ctx, 501, 'no this account')
        return; // 如果账户不存在，返回0
    }
})

// 获取账户的token balance
router.get('/token_balance', async (ctx) => {
    const input_owner = ctx.query.owner;
    const input_mint = ctx.query.mint;
    if (!input_mint) {
        sendErrorResponse(ctx, 501, "miss owner or mint")
        return
    }
    try {
        const target: PublicKey = input_owner ? new PublicKey(input_owner) : owner.publicKey;
        const filter = {mint: new PublicKey(input_mint)};
        let acc = await connection.getParsedTokenAccountsByOwner(target, filter);
        if (acc.value.length === 0) {
            ctx.body = {
                "isNative": false,
                "mint": input_mint,
                "owner": target.toString(),
                "state": "initialized",
                "tokenAmount": null
            }
            return;
        }
        let tokenAccountParsed = acc.value[0];
        const data = tokenAccountParsed.account.data.parsed.info;
        // ctx.body=data

        ctx.body = {
            "isNative": data['isNative'],
            "mint": data["mint"],
            "owner": data['owner'],
            "state": data['state'],
            "amount": data['tokenAmount']['amount'],
            "decimals": data['tokenAmount']['decimals'],
            "uiAmount": data['tokenAmount']['uiAmount'],
            "uiAmountString": data['tokenAmount']['uiAmountString'],
        }
    } catch (e) {
        sendErrorResponse(ctx, 500, e)
    }
})
// 查询本钱包下所有的token信息
router.get('/tokens', async (ctx) => {
    const input_owner = ctx.query.owner;
    try {
        const target: PublicKey = input_owner ? new PublicKey(input_owner) : owner.publicKey;
        const tokenAccounts = await connection.getTokenAccountsByOwner(target, {
            programId: TOKEN_PROGRAM_ID,
        });
        let tokens = [];
        for (const tokenAccount of tokenAccounts.value) {
            const accountInfo = await connection.getAccountInfo(tokenAccount.pubkey);
            if (accountInfo && accountInfo.data.length === AccountLayout.span) {
                const parsedData: RawAccount = AccountLayout.decode(accountInfo.data);
                const token = {
                    'mint': parsedData.mint.toString(),
                    'owner': parsedData.owner.toString(),
                    'amount': parsedData.amount.toString(),
                    'delegateOption': parsedData.delegateOption,
                    'delegate': parsedData.delegate.toString(),
                    'state': parsedData.state,
                    'isNativeOption': parsedData.isNativeOption,
                    'isNative': parsedData.isNative.toString(),
                    'closeAuthorityOption': parsedData.closeAuthorityOption,
                    'closeAuthority': parsedData.closeAuthorityOption.toString(),

                }
                tokens.push(token);
            }
        }
        ctx.body = tokens;
    } catch (e) {
        sendErrorResponse(ctx, 503, e)
        return
    }


})

// 关闭账户
router.put('close_account', async (ctx) => {
    //todo 构建交易并关闭Token账户，将租金退回到所有者账户
    sendErrorResponse(ctx, 501, "This function is not implemented ")
})

export default router;
