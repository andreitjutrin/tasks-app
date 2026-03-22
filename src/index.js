const { getConfig } = require('./config')
const { getGoogleAuth } = require('./googleAuth')
const { rolloverTasks } = require('./rollover')

/**
 * Lambda entry point.
 * Triggered nightly by EventBridge at midnight (local time).
 */
exports.handler = async () => {
  console.log('Task rollover started')

  const config = await getConfig()
  const auth = await getGoogleAuth(config)
  await rolloverTasks(auth, config)

  console.log('Task rollover finished')
}
