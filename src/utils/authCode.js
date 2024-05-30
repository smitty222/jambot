import fetch from 'node-fetch'
import querystring from 'querystring'

async function getUserAccessToken (clientId, clientSecret, code, redirectUri) {
  const authOptions = {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: querystring.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    })
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', authOptions)

    if (!response.ok) {
      throw new Error(`Failed to retrieve user access token: ${response.statusText}`)
    }

    const data = await response.json()
    return data.access_token
  } catch (error) {
    console.error('Error getting user access token:', error)
    throw error
  }
}

async function obtainInitialAuthorization () {
  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
    const code = process.env.SPOTIFY_AUTHORIZATION_CODE // Assuming you've stored the authorization code somewhere
    const redirectUri = process.env.REDIRECT_URI

    const accessToken = await getUserAccessToken(clientId, clientSecret, code, redirectUri)

    process.env.SPOTIFY_ACCESS_TOKEN = accessToken

    console.log('Initial authorization successful. Access token obtained:', accessToken)
  } catch (error) {
    console.error('Error obtaining initial authorization:', error)
  }
}

export { getUserAccessToken, obtainInitialAuthorization }
