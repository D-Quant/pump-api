import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import accountRouter from './routes/account';
import ammRouter from './routes/amm'
import clmmRouter from './routes/clmm'
import coreRouter from './routes/core'
import rootRouter from './routes/root'

import logger from 'koa-logger';

const app = new Koa();
const router = new Router();
// 使用 logger 中间件记录请求和响应
app.use(logger());
// 使用 bodyParser 中间件解析请求体
app.use(bodyParser());

// 加载模块路由
router.use('/account', accountRouter.routes(), accountRouter.allowedMethods());
router.use('/amm', ammRouter.routes(), ammRouter.allowedMethods());
router.use('/clmm', clmmRouter.routes(), clmmRouter.allowedMethods());
router.use('/core', coreRouter.routes(), coreRouter.allowedMethods());
router.use('/', rootRouter.routes(), rootRouter.allowedMethods());

// 使用主路由
app.use(router.routes()).use(router.allowedMethods());

// 启动服务器
const PORT = 8000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});