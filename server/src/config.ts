import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/orderflow'),
  JWT_ACCESS_SECRET: z.string().default('orderflow-access-secret-change-in-prod'),
  JWT_REFRESH_SECRET: z.string().default('orderflow-refresh-secret-change-in-prod'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  CHANNEL: z.enum(['simulator', 'whatsapp-webjs', 'whatsapp-cloud']).default('simulator'),
  PAYMENT_PROVIDER: z.enum(['mock', 'razorpay']).default('mock'),
  PRINTER_TYPE: z.enum(['mock', 'network']).default('mock'),
  PRINTER_HOST: z.string().default('192.168.1.100'),
  PRINTER_PORT: z.coerce.number().default(9100),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  WHATSAPP_CLOUD_TOKEN: z.string().optional(),
  WHATSAPP_CLOUD_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  BASE_URL: z.string().default('http://localhost:4000'),
});

export type Config = z.infer<typeof envSchema>;

let _config: Config;

export function getConfig(): Config {
  if (!_config) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error('Invalid environment variables:', result.error.format());
      process.exit(1);
    }
    _config = result.data;
  }
  return _config;
}
