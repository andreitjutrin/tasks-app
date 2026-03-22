const { google } = require('googleapis')

/**
 * Creates an authenticated Google OAuth2 client using the stored refresh token.
 * The access token is fetched automatically and refreshed as needed.
 */
async function getGoogleAuth(config) {
  const auth = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret
  )

  auth.setCredentials({
    refresh_token: config.googleRefreshToken,
  })

  // Force a token refresh to validate credentials early
  await auth.getAccessToken()

  return auth
}

module.exports = { getGoogleAuth }
