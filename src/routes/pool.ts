import Router from "koa-router";
import {pumpEngine} from "../config";
import {sendErrorResponse} from "../helpers/response";

const axios = require('axios');

const router = new Router();
// 获取池子信息
router.get('/pump_info', async (ctx) => {
    // 代币地址mint
    const mint = ctx.query.mint as string;

    const info = await pumpEngine.getPoolInfo(mint)
    if (!info) {
        sendErrorResponse(ctx, 501, 'can not find this BondingCurveAccount by mint mint')
        return
    }
    ctx.body = info
})

export default router;

