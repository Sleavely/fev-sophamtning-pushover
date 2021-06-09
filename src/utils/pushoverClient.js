const {
  PUSHOVER_APPKEY = '',
} = process.env

const got = require('got')

exports.sendNotification = async (msg) => {
  const targetUrl = 'https://api.pushover.net/1/messages.json'
  await got.post(targetUrl, {
    responseType: 'json',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    json: {
      token: PUSHOVER_APPKEY,
      ...msg,
    },
    // Honestly most of the time the only error we get is that the user token is wrong,
    // and we dont want those so we'll skip looking at the response altogether.
    throwHttpErrors: false,
  })
}
