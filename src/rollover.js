const { DateTime } = require('luxon')
const { getTasksForDate, moveEventToDate, stackTasksForDay } = require('./calendar')

/**
 * Main rollover logic:
 * 1. Fetch today's blue events
 * 2. Skip events on past dates (user dragged them back = completed)
 * 3. Move remaining events to tomorrow
 * 4. Stack them with time slots across the day
 */
async function rolloverTasks(auth, config) {
  const { calendarId, timezone, maxTasksPerDay } = config

  const today = DateTime.now().setZone(timezone).startOf('day')
  const tomorrow = today.plus({ days: 1 })

  console.log(`Running rollover for ${today.toISODate()} → ${tomorrow.toISODate()} (${timezone})`)

  // Fetch today's tasks
  const todaysTasks = await getTasksForDate(auth, calendarId, today, timezone)
  console.log(`Found ${todaysTasks.length} blue event(s) on today's calendar`)

  const tasksToRollover = []

  for (const task of todaysTasks) {
    const taskDate = getEventDate(task, timezone)

    if (taskDate < today) {
      // Event is on a past date — user dragged it back = completed, skip
      console.log(`Completed (past date): "${task.summary}"`)
      continue
    }

    tasksToRollover.push(task)
  }

  if (tasksToRollover.length === 0) {
    console.log('No tasks to roll over — all done!')
    return
  }

  // Cap at max tasks per day — excess stays as-is (or push to day after tomorrow)
  const capped = tasksToRollover.slice(0, maxTasksPerDay)
  const overflow = tasksToRollover.slice(maxTasksPerDay)

  if (overflow.length > 0) {
    const dayAfterTomorrow = tomorrow.plus({ days: 1 })
    console.log(`${overflow.length} task(s) overflow — pushing to ${dayAfterTomorrow.toISODate()}`)
    for (const task of overflow) {
      await moveEventToDate(auth, calendarId, task, dayAfterTomorrow, timezone)
    }
  }

  // Move capped tasks to tomorrow
  for (const task of capped) {
    await moveEventToDate(auth, calendarId, task, tomorrow, timezone)
  }

  // Stack them with time slots across tomorrow
  await stackTasksForDay(auth, calendarId, capped, tomorrow, config)

  console.log(`Rollover complete — ${capped.length} task(s) moved to ${tomorrow.toISODate()}`)
}

function getEventDate(event, timezone) {
  if (event.start.date) {
    return DateTime.fromISO(event.start.date, { zone: timezone })
  }
  return DateTime.fromISO(event.start.dateTime).setZone(timezone).startOf('day')
}

module.exports = { rolloverTasks }
