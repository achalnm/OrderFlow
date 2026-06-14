import http from 'http';
import { getConfig } from './config';
import { createApp } from './app';
import { connectDB } from './db';
import { initSocketServer } from './socket';
import { initPrinterService } from './printer';
import { initPaymentProvider } from './payments';
import { setChannelAdapter } from './channels';
import { simulatorChannel } from './channels/simulator';
import { handleIncoming } from './bot/engine';
import { logger } from './logger';
import { Tenant } from './models/Tenant';

async function main() {
  const config = getConfig();
  await connectDB(config.MONGODB_URI);

  const count = await Tenant.countDocuments();
  if (count === 0) {
    logger.info('no tenants, seeding...');
    const { seed } = await import('./seed/index');
    await seed(false);
    logger.info('seed done');
  }

  const app = createApp();
  const httpServer = http.createServer(app);

  initSocketServer(httpServer, config.CORS_ORIGIN);
  initPrinterService();
  initPaymentProvider();

  simulatorChannel.onIncoming(async (tenantId, phone, text) => {
    const replies = await handleIncoming({ tenantId, customerPhone: phone, text });
    for (const reply of replies) {
      await simulatorChannel.sendMessage(phone, reply);
    }
  });

  if (config.CHANNEL === 'whatsapp-webjs') {
    const { WhatsAppWebJsChannel } = await import('./channels/whatsappWebJs');
    const firstTenant = await import('./models/Tenant').then((m) => m.Tenant.findOne({ status: 'active' }));
    if (firstTenant) {
      const wjsChannel = new WhatsAppWebJsChannel(firstTenant._id.toString());
      wjsChannel.onIncoming(async (tenantId, phone, text) => {
        const replies = await handleIncoming({ tenantId, customerPhone: phone, text });
        for (const reply of replies) {
          await wjsChannel.sendMessage(phone, reply);
        }
      });
      await wjsChannel.start();
      setChannelAdapter(wjsChannel);
      logger.info('WhatsApp Web.js channel active');
    }
  } else if (config.CHANNEL === 'whatsapp-cloud') {
    logger.info('whatsapp cloud channel ready');
  } else {
    setChannelAdapter(simulatorChannel);
    logger.info('Simulator channel active');
  }

  httpServer.listen(config.PORT, () => {
    logger.info(`OrderFlow server listening on port ${config.PORT}`);
    logger.info(`Bot simulator: POST /api/simulator/:tenantSlug/message`);
    logger.info(`Mock pay page: GET /pay/:orderId`);
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down...');
    await import('./db').then((m) => m.disconnectDB());
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
