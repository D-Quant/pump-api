import Router from "koa-router";
import {pumpEngine} from "../config";
import {sendErrorResponse} from "../helpers/response";

const router = new Router();

interface BuyRequestBody {
    mint_pk: string,
    sol_input: string,
    slippage?: string,
    unitPrice?: number,
    unitLimit?: number,
    jito: boolean,
    custom_fee?: string,
}

interface SellRequestBody {
    mint_pk: string,
    token_input: string,
    slippage?: string,
    unitPrice?: number,
    unitLimit?: number,
    jito: boolean,
    custom_fee?: string
}

router.post('/buy', async (ctx) => {
    const {
        mint_pk,
        sol_input,
        slippage,
        unitPrice,
        unitLimit,
        jito,
        custom_fee,
    } = ctx.request.body as BuyRequestBody;
    if (!mint_pk || !sol_input) {
        sendErrorResponse(ctx, 501, "miss 'mint_pk' or 'sol_input'")
        return;
    }
    ctx.body = await pumpEngine.buy(mint_pk, sol_input, slippage, unitPrice, unitLimit, jito, custom_fee)
})

router.post('/sell', async (ctx) => {
    const {
        mint_pk,
        token_input,
        unitPrice,
        unitLimit,
        jito,
        custom_fee
    } = ctx.request.body as SellRequestBody;
    if (!mint_pk || !token_input) {
        sendErrorResponse(ctx, 501, "miss 'mint_pk' or 'token_input'")
        return;
    }
    // ctx.body = {'ok': 'ok'}
    ctx.body = await pumpEngine.sell(mint_pk, token_input, unitPrice, unitLimit, jito, custom_fee)

})
export default router;
