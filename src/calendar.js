const { google } = require('googleapis')
const { DateTime } = require('luxon')

const BLUE_COLOR_ID = null // null = calendar default color = blue

/**
 * Returns all events from the given calendar on the given date (in local timezone).
 * Only returns events that use the default calendar color (blue = task).
 */
async function getTasksForDate(auth, calendarId, date, timezone) {
  const calendar = google.calendar({ version: 'v3', auth })

  const startOfDay = date.startOf('day').toUTC().toISO()
  const endOfDay = date.endOf('day').toUTC().toISO()

  const response = await calendar.events.list({
    calendarId,
    timeMin: startOfDay,
    timeMax: endOfDay,
    singleEvents: true,
    orderBy: 'startTime',
  })

  const events = response.data.items || []

  // Tasks = timed events with no specific colorId (using calendar default = blue)
  // All-day events are excluded — they are calendar markers, not tasks to roll over
  return events.filter(event => {
    const hasNoColor = !event.colorId
    const isNotDeclined = !isDeclined(event)
    const isTimedEvent = !event.start.date // all-day events have start.date; timed have start.dateTime
    return hasNoColor && isNotDeclined && isTimedEvent
  })
}

/**
 * Returns all blue events in the calendar that fall on a past date.
 * These are tasks the user dragged to a previous day = completed.
 */
async function getCompletedTasks(auth, calendarId, timezone) {
  const calendar = google.calendar({ version: 'v3', auth })

  const yesterday = DateTime.now().setZone(timezone).minus({ days: 1 })
  const thirtyDaysAgo = DateTime.now().setZone(timezone).minus({ days: 30 })

  const response = await calendar.events.list({
    calendarId,
    timeMin: thirtyDaysAgo.startOf('day').toUTC().toISO(),
    timeMax: yesterday.endOf('day').toUTC().toISO(),
    singleEvents: true,
  })

  const events = response.data.items || []
  return events.filter(event => !event.colorId)
}

/**
 * Moves an event to a new date, preserving its duration.
 * If the event has a time, keeps the same time on the new date.
 */
async function moveEventToDate(auth, calendarId, event, newDate, timezone) {
  const calendar = google.calendar({ version: 'v3', auth })

  let updatedStart, updatedEnd

  if (event.start.date) {
    // All-day event
    updatedStart = { date: newDate.toISODate() }
    updatedEnd = { date: newDate.plus({ days: 1 }).toISODate() }
  } else {
    // Timed event — preserve time on new date
    const originalStart = DateTime.fromISO(event.start.dateTime).setZone(timezone)
    const originalEnd = DateTime.fromISO(event.end.dateTime).setZone(timezone)
    const duration = originalEnd.diff(originalStart)

    const newStart = newDate.set({
      hour: originalStart.hour,
      minute: originalStart.minute,
      second: 0,
    })
    const newEnd = newStart.plus(duration)

    updatedStart = { dateTime: newStart.toUTC().toISO(), timeZone: timezone }
    updatedEnd = { dateTime: newEnd.toUTC().toISO(), timeZone: timezone }
  }

  await calendar.events.patch({
    calendarId,
    eventId: event.id,
    requestBody: {
      start: updatedStart,
      end: updatedEnd,
    },
  })

  console.log(`Moved: "${event.summary}" → ${newDate.toISODate()}`)
}

/**
 * Assigns stacked time slots to a list of tasks for the given day.
 * Respects work hours, lunch break, and gaps between tasks.
 */
async function stackTasksForDay(auth, calendarId, tasks, targetDate, config) {
  const { timezone, workStart, workEnd, taskDurationMins, bufferMins } = config

  const [wsH, wsM] = workStart.split(':').map(Number)
  const [weH, weM] = workEnd.split(':').map(Number)

  const calendar = google.calendar({ version: 'v3', auth })

  let cursor = targetDate.set({ hour: wsH, minute: wsM, second: 0 })
  const workEndTime = targetDate.set({ hour: weH, minute: weM, second: 0 })

  for (const task of tasks) {
    // Stop if past work end
    if (cursor >= workEndTime) {
      console.log(`Out of work hours — remaining tasks left as all-day events`)
      break
    }

    const taskEnd = cursor.plus({ minutes: taskDurationMins })

    await calendar.events.patch({
      calendarId,
      eventId: task.id,
      requestBody: {
        start: { dateTime: cursor.toUTC().toISO(), timeZone: timezone },
        end: { dateTime: taskEnd.toUTC().toISO(), timeZone: timezone },
      },
    })

    console.log(`Stacked: "${task.summary}" at ${cursor.toFormat('HH:mm')}`)

    cursor = taskEnd.plus({ minutes: bufferMins })
  }
}

function isDeclined(event) {
  if (!event.attendees) return false
  return event.attendees.some(a => a.self && a.responseStatus === 'declined')
}

module.exports = { getTasksForDate, getCompletedTasks, moveEventToDate, stackTasksForDay }
