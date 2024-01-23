import got from 'got'

const {
  PUSHOVER_APPKEY = '',
} = process.env

interface PushoverNotification {
  token: string
  user: string
  message: string

  /**
   * your message's title, otherwise your app's name is used
   */
  title?: string
  /**
   * a supplementary URL to show with your message
   */
  url?: string
  /**
   * a title for the 'url' parameter, otherwise just the URL is shown
   */
  url_title?: string
}

export const sendNotification = async (msg: Omit<PushoverNotification, 'token'>): Promise<void> => {
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
