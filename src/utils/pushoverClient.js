const {
  PUSHOVER_APPKEY = '',
} = process.env

const Push = new (require('pushover-notifications'))({ token: PUSHOVER_APPKEY })

/**
 * Sample argument:
 * {
 *   user: 'token',
 *   message: 'omg node test',
 *   title: "Well - this is fantastic",
 *   sound: 'magic' // optional
 *   priority: 1 // optional,
 *   file: '/tmp/fancy_image.png' // optional
 * }
 */
exports.sendNotification = async (msg) => {
  return new Promise((resolve, reject) => {
    Push.send(msg, (err, res) => {
      if (err) return reject(err)
      resolve(res)
    })
  })
}
