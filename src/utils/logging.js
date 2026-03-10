// src/utils/logging.js
import winston from 'winston'
import { env } from '../config.js'

const level = env.logLevel

// Safely stringify meta, including nested Error objects
function jsonReplacer (_key, value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    }
  }
  return value
}

const devFmt = winston.format.printf((info) => {
  const { level, message, timestamp, stack, ...meta } = info
  const metaStr = Object.keys(meta).length
    ? ' ' + JSON.stringify(meta, jsonReplacer)
    : ''
  const stackStr = stack ? `\n${stack}` : ''
  return `${timestamp} ${level}: ${message}${metaStr}${stackStr}`
})

export const logger = winston.createLogger({
  level,
  format: winston.format.combine(
    // Capture error objects and attach .stack to info
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    env.nodeEnv === 'production'
      ? winston.format.json() // includes "stack" thanks to errors()
      : devFmt
  ),
  defaultMeta: { service: 'jamflow-bot' },
  transports: [new winston.transports.Console()]
})

// Optional file logging
if (env.logToFile) {
  logger.add(new winston.transports.File({
    filename: env.logFile || 'app.log'
  }))
}
