import { IOrder } from '../models/Order';
import { Tenant } from '../models/Tenant';
import fs from 'fs';
import path from 'path';
import { getSocketServer } from '../socket';
import { logger } from '../logger';

export interface PrinterService {
  printReceipt(order: IOrder, tenantId: string): Promise<void>;
}

function formatReceipt(order: IOrder, restaurantName: string): string {
  const W = 32;
  const line = '-'.repeat(W);
  const center = (s: string) => {
    const pad = Math.max(0, Math.floor((W - s.length) / 2));
    return ' '.repeat(pad) + s;
  };
  const cols = (left: string, right: string) => {
    const space = W - left.length - right.length;
    return left + ' '.repeat(Math.max(1, space)) + right;
  };
  const paise = (v: number) => `Rs.${(v / 100).toFixed(2)}`;
  const now = new Date(order.createdAt);
  const dt = `${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-IN')}`;

  const lines: string[] = [
    center(restaurantName),
    center('ORDER RECEIPT'),
    line,
    cols('Order:', order.orderNumber),
    cols('Date:', dt),
    cols('Payment:', order.paymentMethod.toUpperCase()),
    line,
    'ITEMS:',
    ...order.items.map((item) =>
      cols(`${item.qty}x ${item.nameSnapshot.substring(0, 18)}`, paise(item.priceSnapshot * item.qty))
    ),
    line,
    cols('Subtotal:', paise(order.subtotal)),
    cols('Tax:', paise(order.taxes)),
    cols('TOTAL:', paise(order.total)),
    line,
    center('Thank you for your order!'),
    center('Visit us again'),
    '',
  ];
  return lines.join('\n');
}

class MockPrinter implements PrinterService {
  async printReceipt(order: IOrder, tenantId: string): Promise<void> {
    try {
      const tenant = await Tenant.findById(tenantId);
      const restaurantName = tenant?.name ?? 'Restaurant';
      const receipt = formatReceipt(order, restaurantName);

      const dir = path.resolve(__dirname, '../../printouts');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${order.orderNumber}.txt`), receipt, 'utf8');

      const io = getSocketServer();
      if (io) {
        io.to(`tenant:${tenantId}`).emit('receipt:printed', {
          orderNumber: order.orderNumber,
          orderId: order._id.toString(),
          text: receipt,    // 'text' matches Orders drawer handler
          receipt,          // keep for backwards compat
        });
      }
      logger.info({ orderNumber: order.orderNumber }, 'Mock receipt printed');
    } catch (err) {
      logger.error({ err }, 'Mock printer error');
    }
  }
}

class NetworkPrinter implements PrinterService {
  constructor(private host: string, private port: number) {}

  async printReceipt(order: IOrder, tenantId: string): Promise<void> {
    try {
      const { ThermalPrinter, PrinterTypes, CharacterSet } = await import('node-thermal-printer');
      const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: `tcp://${this.host}:${this.port}`,
        characterSet: CharacterSet.PC437_USA,
        removeSpecialCharacters: false,
        options: { timeout: 5000 },
      });

      const tenant = await Tenant.findById(tenantId);
      const restaurantName = tenant?.name ?? 'Restaurant';
      const paise = (v: number) => `Rs.${(v / 100).toFixed(2)}`;

      printer.alignCenter();
      printer.bold(true);
      printer.println(restaurantName);
      printer.bold(false);
      printer.println('ORDER RECEIPT');
      printer.drawLine();
      printer.alignLeft();
      printer.println(`Order: ${order.orderNumber}`);
      printer.println(`Payment: ${order.paymentMethod.toUpperCase()}`);
      printer.drawLine();
      for (const item of order.items) {
        printer.println(`${item.qty}x ${item.nameSnapshot}`);
        printer.alignRight();
        printer.println(paise(item.priceSnapshot * item.qty));
        printer.alignLeft();
      }
      printer.drawLine();
      printer.println(`Subtotal: ${paise(order.subtotal)}`);
      printer.println(`Tax: ${paise(order.taxes)}`);
      printer.bold(true);
      printer.println(`TOTAL: ${paise(order.total)}`);
      printer.bold(false);
      printer.drawLine();
      printer.alignCenter();
      printer.println('Thank you!');
      printer.cut();

      await printer.execute();
      logger.info({ orderNumber: order.orderNumber }, 'Network receipt printed');
    } catch (err) {
      logger.error({ err }, 'network printer error, skipping');
    }
  }
}

let _printerService: PrinterService;

export function initPrinterService(): PrinterService {
  const type = process.env.PRINTER_TYPE ?? 'mock';
  if (type === 'network') {
    _printerService = new NetworkPrinter(
      process.env.PRINTER_HOST ?? '192.168.1.100',
      parseInt(process.env.PRINTER_PORT ?? '9100')
    );
  } else {
    _printerService = new MockPrinter();
  }
  return _printerService;
}

export function getPrinterService(): PrinterService {
  if (!_printerService) _printerService = new MockPrinter();
  return _printerService;
}
