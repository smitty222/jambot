// src/libs/scheduler.js
//
// A minimal job scheduler for periodic background tasks. Instead of
// scattering setInterval and setTimeout calls across the codebase, use
// this module to register recurring jobs. Each job is given an ID, a
// function to invoke, and an interval in milliseconds. The scheduler
// applies a small random jitter to each interval to prevent phase
// alignment (e.g., multiple jobs firing at exactly the same time).
//
// It also guards against overlapping executions: if the job is still
// running when the next interval fires, the invocation is skipped.

const jobs = new Map()

/**
 * Register a recurring job. If a job with the same name already
 * exists, it will be cleared and replaced.
 *
 * @param {string} id Unique identifier for the job
 * @param {() => Promise<void>|void} fn Async or sync function to run
 * @param {number} intervalMs Base interval in milliseconds
 * @param {number} [jitter=0.2] Jitter fraction (0.2 = ±20%)
 */
export function registerJob (id, fn, intervalMs, jitter = 0.2) {
  clearJob(id)
  const state = { running: false, timer: null }
  function scheduleNext () {
    const j = intervalMs * (1 - jitter + Math.random() * jitter * 2)
    state.timer = setTimeout(async () => {
      if (state.running) {
        // Skip if previous invocation is still running
        scheduleNext()
        return
      }
      state.running = true
      try {
        await fn()
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[scheduler] Job '${id}' error:`, err?.message || err)
      } finally {
        state.running = false
        scheduleNext()
      }
    }, j)
  }
  scheduleNext()
  jobs.set(id, state)
}

/**
 * Clear a registered job by ID. If the job is running, it will be
 * cancelled on the next iteration.
 *
 * @param {string} id
 */
export function clearJob (id) {
  const state = jobs.get(id)
  if (state && state.timer) {
    clearTimeout(state.timer)
  }
  jobs.delete(id)
}

/**
 * Clear all jobs. Useful for graceful shutdown.
 */
export function clearAllJobs () {
  for (const id of jobs.keys()) {
    clearJob(id)
  }
}
