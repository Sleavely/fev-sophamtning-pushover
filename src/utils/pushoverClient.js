const {
  PUSHOVER_APPKEY = '',
} = process.env

const Push = new (require('pushover-notifications'))({ token: PUSHOVER_APPKEY })

exports.sendNotification = async (msg) => {
  return new Promise((resolve, reject) => {
    Push.send(msg, (err, res) => {
      if (err) return reject(err)
      resolve(res)
    })
  })
}
