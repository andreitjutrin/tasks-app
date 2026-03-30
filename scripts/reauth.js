/**
 * Re-authentication script.
 * Fetches Google OAuth credentials from SSM, opens the consent URL,
 * exchanges the auth code for a new refresh token, and updates SSM.
 *
 * Usage: node scripts/reauth.js
 */

const { SSMClient, GetParametersByPathCommand, PutParameterCommand } = require('@aws-sdk/client-ssm')
const { google } = require('googleapis')
const readline = require('readline')
const { exec } = require('child_process')

const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'
const SCOPES = ['https://www.googleapis.com/auth/calendar']
const SSM_PATH = '/taskapp/'

const ssm = new SSMClient({})

async function getSsmParams() {
  const response = await ssm.send(new GetParametersByPathCommand({
    Path: SSM_PATH,
    Recursive: true,
    WithDecryption: true,
  }))

  const params = {}
  for (const p of response.Parameters) {
    const key = p.Name.replace(SSM_PATH, '')
    params[key] = p.Value
  }
  return params
}

async function updateSsmParam(name, value) {
  await ssm.send(new PutParameterCommand({
    Name: `${SSM_PATH}${name}`,
    Value: value,
    Type: 'SecureString',
    Overwrite: true,
  }))
}

function openBrowser(url) {
  const platform = process.platform
  const cmd = platform === 'win32' ? `start "" "${url}"`
    : platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`
  exec(cmd)
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, answer => {
    rl.close()
    resolve(answer.trim())
  }))
}

async function main() {
  console.log('\nFetching credentials from SSM...')
  const params = await getSsmParams()

  const clientId = params['google/client_id']
  const clientSecret = params['google/client_secret']

  if (!clientId || !clientSecret) {
    console.error('ERROR: google/client_id or google/client_secret not found in SSM.')
    process.exit(1)
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })

  console.log('\nOpening Google consent page in your browser...')
  console.log('If it does not open automatically, visit this URL:\n')
  console.log(authUrl)
  openBrowser(authUrl)

  const code = await prompt('\nPaste the authorisation code shown by Google: ')

  if (!code) {
    console.error('No code entered. Aborting.')
    process.exit(1)
  }

  console.log('\nExchanging code for tokens...')
  const { tokens } = await oauth2Client.getToken(code)

  if (!tokens.refresh_token) {
    console.error('ERROR: No refresh_token in response. Make sure you visited the URL above with prompt=consent.')
    process.exit(1)
  }

  console.log('Updating SSM Parameter Store...')
  await updateSsmParam('google/refresh_token', tokens.refresh_token)

  console.log('\nDone! New refresh token saved to /taskapp/google/refresh_token')
  console.log('You can test by running: node src/local.js')
}

main().catch(err => {
  console.error('\nFailed:', err.message)
  process.exit(1)
})
