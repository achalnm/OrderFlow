import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { getConfig } from './config';
import { requestId } from './middleware/requestId';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './logger';

import authRouter from './routes/auth';
import menuRouter from './routes/menu';
import ordersRouter from './routes/orders';
import customersRouter from './routes/customers';
import analyticsRouter from './routes/analytics';
import settingsRouter from './routes/settings';
import webhooksRouter from './routes/webhooks';
import { createSimulatorRouter } from './channels/simulator';

export function createApp() {
  const app = express();
  const config = getConfig();

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(requestId);

  if (config.NODE_ENV !== 'test') {
    app.use(pinoHttp({ logger }));
  }

  app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

  app.get('/pay/:orderId', async (req, res, next) => {
    try {
      const { Order } = await import('./models/Order');
      const order = await Order.findById(req.params.orderId);
      if (!order) { res.status(404).send('Order not found'); return; }
      const paise = (v: number) => `₹${(v / 100).toFixed(2)}`;
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pay for ${order.orderNumber}</title>
<style>
  body{font-family:sans-serif;max-width:400px;margin:40px auto;padding:20px}
  .card{border:1px solid #ddd;border-radius:8px;padding:24px}
  h2{color:#1a1a1a}.amount{font-size:2rem;font-weight:bold;color:#128C7E}
  .btn{display:block;width:100%;padding:14px;border:none;border-radius:6px;font-size:1rem;cursor:pointer;margin-top:12px}
  .btn-pay{background:#128C7E;color:white}.btn-fail{background:#e53e3e;color:white}
  .result{margin-top:16px;padding:12px;border-radius:6px;display:none}
  .result.success{background:#c6f6d5;color:#276749}.result.error{background:#fed7d7;color:#c53030}
</style>
</head>
<body>
<div class="card">
  <h2>Order Payment</h2>
  <p>Order: <strong>${order.orderNumber}</strong></p>
  <div class="amount">${paise(order.total)}</div>
  <p>${order.items.map((i) => `${i.qty}x ${i.nameSnapshot}`).join(', ')}</p>
  <button class="btn btn-pay" onclick="pay('paid')">Pay Now (Test)</button>
  <button class="btn btn-fail" onclick="pay('failed')">Fail Payment</button>
  <div id="result" class="result"></div>
</div>
<script>
async function pay(status){
  const r=document.getElementById('result');
  try{
    const resp=await fetch('/api/webhooks/mock',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({orderId:'${order._id.toString()}',status,eventId:'mockpay_'+Date.now()})});
    const data=await resp.json();
    if(data.success){r.className='result success';r.style.display='block';r.textContent='Payment successful. Order '+data.orderNumber+' confirmed.';}
    else{r.className='result error';r.style.display='block';r.textContent='Payment failed.';}
  }catch(e){r.className='result error';r.style.display='block';r.textContent='Error: '+e.message;}
}
</script>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (err) { next(err); }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/menu', menuRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/webhooks', webhooksRouter);
  app.use('/api/simulator', createSimulatorRouter());

  app.use(errorHandler);

  return app;
}
