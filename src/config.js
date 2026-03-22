const { SSMClient, GetParametersByPathCommand } = require('@aws-sdk/client-ssm')

const ssm = new SSMClient({})

/**
 * Loads all /taskapp/* parameters from SSM Parameter Store.
 * Falls back to environment variables for local testing.
 */
async function getConfig() {
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    console.log('Using local .env config')
    return {
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
      googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN,
      calendarId: process.env.CALENDAR_ID || 'primary',
      timezone: process.env.TIMEZONE || 'Europe/London',
      workStart: process.env.WORK_START || '09:00',
      workEnd: process.env.WORK_END || '18:00',
      taskDurationMins: parseInt(process.env.TASK_DURATION_MINS || '30'),
      bufferMins: parseInt(process.env.BUFFER_MINS || '10'),
      maxTasksPerDay: parseInt(process.env.MAX_TASKS_PER_DAY || '6'),
    }
  }

  console.log('Loading config from SSM Parameter Store')
  const response = await ssm.send(new GetParametersByPathCommand({
    Path: '/taskapp/',
    Recursive: true,
    WithDecryption: true,
  }))

  const params = {}
  for (const p of response.Parameters) {
    const key = p.Name.replace('/taskapp/', '')
    params[key] = p.Value
  }

  return {
    googleClientId: params['google/client_id'],
    googleClientSecret: params['google/client_secret'],
    googleRefreshToken: params['google/refresh_token'],
    calendarId: params['calendar_id'] || 'primary',
    timezone: params['timezone'] || 'Europe/London',
    workStart: params['work_start'] || '09:00',
    workEnd: params['work_end'] || '18:00',
    taskDurationMins: parseInt(params['task_duration_mins'] || '30'),
    bufferMins: parseInt(params['buffer_mins'] || '10'),
    maxTasksPerDay: parseInt(params['max_tasks_per_day'] || '6'),
  }
}

module.exports = { getConfig }
