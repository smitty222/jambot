
export function buildHeaders() {
  return {
    appid: process.env.CHAT_API_KEY,
    authtoken: process.env.CHAT_TOKEN,
    dnt: 1,
    origin: 'https://tt.live',
    referer: 'https://tt.live/',
    sdk: 'javascript@3.0.10'
  };
}
