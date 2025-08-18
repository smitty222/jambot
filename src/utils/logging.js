// src/utils/logging.js
import winston from 'winston';

const level =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const devFmt = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${level}: ${message}${rest}`;
});

export const logger = winston.createLogger({
  level,
  format: winston.format.combine(
    winston.format.timestamp(),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : devFmt
  ),
  defaultMeta: { service: 'jamflow-bot' },
  transports: [new winston.transports.Console()],
});

if (process.env.LOG_TO_FILE) {
  logger.add(new winston.transports.File({
    filename: process.env.LOG_FILE || 'app.log',
  }));
}
