/**
 * Local test runner — run with `npm start` to test without deploying to AWS.
 * Copy .env.example to .env and fill in your credentials first.
 */
require('dotenv').config()
const { handler } = require('./index')

handler()
  .then(() => console.log('Done'))
  .catch(err => {
    console.error('Error:', err.message)
    process.exit(1)
  })
