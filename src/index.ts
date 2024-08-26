import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import accountRouter from './routes/account';
import tradeRouter from './routes/trade';
import poolRouter from './routes/pool'
import logger from 'koa-logger';

const app = new Koa();
const router = new Router();

// 使用 logger 中间件记录请求和响应
app.use(logger());

// 使用 bodyParser 中间件解析请求体
app.use(bodyParser());

// 定义根路径的 GET 或 POST 路由
router.get('/', async (ctx) => {
    ctx.body = {
        'name': 'pump-api',
        'version': 'v1.0.1',
        'author': 'Matrix.Ye',
        'desc': 'api of pump',
        'message': 'Welcome to the root endpoint!'
    }
});

// 加载模块路由
router.use('/account', accountRouter.routes(), accountRouter.allowedMethods());
router.use('/pool', poolRouter.routes(), poolRouter.allowedMethods());
router.use('/trade', tradeRouter.routes(), tradeRouter.allowedMethods());

// 使用主路由
app.use(router.routes()).use(router.allowedMethods());

// 启动服务器
const PORT = 8000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});