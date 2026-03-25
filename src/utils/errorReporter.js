// src/utils/errorReporter.js
//
// Thin wrapper around Sentry for error aggregation and alerting.
// All exports are safe no-ops when SENTRY_DSN is not configured, so
// this module can be imported everywhere without requiring Sentry to be
// set up in every environment (local dev, CI, staging, etc.).
//
// To activate: set the SENTRY_DSN environment variable and ensure
// @sentry/node is installed (npm install @sentry/node).

import { logger } from './logging.js'

let Sentry = null
let initialised = false

/**
 * Call once at application startup (before the bot connects).
 * Does nothing if SENTRY_DSN is not set.
 */
export async function initErrorReporter () {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    logger.debug('[errorReporter] SENTRY_DSN not set — error reporting disabled')
    return
  }

  try {
    const mod = await import('@sentry/node')
    Sentry = mod
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0
    })
    initialised = true
    logger.info('[errorReporter] Sentry initialised')
  } catch (err) {
    logger.warn('[errorReporter] Failed to load @sentry/node — install it to enable error reporting', {
      err: err?.message || err
    })
  }
}

/**
 * Capture an exception with optional context metadata.
 *
 * @param {unknown} err
 * @param {Record<string, unknown>} [context]
 */
export function captureException (err, context = {}) {
  if (initialised && Sentry) {
    Sentry.withScope((scope) => {
      scope.setExtras(context)
      Sentry.captureException(err)
    })
  } else {
    logger.error('[errorReporter] captureException (Sentry inactive):', {
      err: err?.message || err,
      ...context
    })
  }
}

/**
 * Capture a non-exception message with optional context metadata.
 *
 * @param {string} message
 * @param {'fatal'|'error'|'warning'|'info'|'debug'} [level]
 * @param {Record<string, unknown>} [context]
 */
export function captureMessage (message, level = 'error', context = {}) {
  if (initialised && Sentry) {
    Sentry.withScope((scope) => {
      scope.setExtras(context)
      Sentry.captureMessage(message, level)
    })
  } else {
    logger[level === 'warning' ? 'warn' : level]?.('[errorReporter] captureMessage (Sentry inactive):', {
      message,
      ...context
    })
  }
}
