/**
 * Re-authentication script.
 * Fetches Google OAuth credentials from SSM, opens the consent URL in a browser,
 * captures the auth code via a local HTTP server, exchanges it for a new refresh
 * token, and updates SSM automatically.
 *
 * Usage: node scripts/reauth.js
 */

const { SSMClient, GetParametersByPathCommand, PutParameterCommand } = require('@aws-sdk/client-ssm')
const { google } = require('googleapis')
const http = require('http')
const { exec } = require('child_process')

const PORT = 3000
const REDIRECT_URI = `http://localhost:${PORT}`
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

function waitForAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end('<h2>Authorisation denied. You can close this tab.</h2>')
        server.close()
        reject(new Error(`Google returned error: ${error}`))
        return
      }

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<h2>Authorisation complete! You can close this tab and return to the terminal.</h2>')
        server.close()
        resolve(code)
      }
    })

    server.listen(PORT, () => {
      console.log(`Listening for Google callback on http://localhost:${PORT}`)
    })

    server.on('error', reject)
  })
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
  console.log('If it does not open automatically, visit:\n')
  console.log(authUrl)
  console.log()
  openBrowser(authUrl)

  const code = await waitForAuthCode()

  console.log('\nExchanging code for tokens...')
  const { tokens } = await oauth2Client.getToken(code)

  if (!tokens.refresh_token) {
    console.error('ERROR: No refresh_token returned. Try revoking app access in your Google account and running this again.')
    process.exit(1)
  }

  console.log('Updating SSM Parameter Store...')
  await updateSsmParam('google/refresh_token', tokens.refresh_token)

  console.log('\nDone! New refresh token saved to /taskapp/google/refresh_token')
  console.log('Test with: node src/local.js')
}

main().catch(err => {
  console.error('\nFailed:', err.message)
  process.exit(1)
})
