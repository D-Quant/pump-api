import Router from "koa-router";
import {pumpEngine} from "../config";
import {sendErrorResponse} from "../helpers/response";

const router = new Router();
// 获取池子信息
router.get('/info', async (ctx) => {
    // 代币地址mint
    const mint = ctx.query.mint as string;
    if (!mint) {
        sendErrorResponse(ctx, 501, 'token mint miss')
        return
    }
    try {
        const info = await pumpEngine.getPoolInfo(mint)
        if (!info) {
            sendErrorResponse(ctx, 501, 'can not find this BondingCurveAccount by mint mint')
            return
        }
        ctx.body = {
            'discriminator': info.discriminator.toString(),
            'virtualTokenReserves': info.virtualTokenReserves.toString(),
            'virtualSolReserves': info.virtualSolReserves.toString(),
            'realTokenReserves': info.realTokenReserves.toString(),
            'realSolReserves': info.realSolReserves.toString(),
            'tokenTotalSupply': info.tokenTotalSupply.toString(),
            'complete': info.complete.toString(),
        }
    } catch (e) {
        sendErrorResponse(ctx, 501, `${e}`)
        return
    }
})

export default router;

