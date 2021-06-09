const {
  NOTIFICATION_MARGIN = '21600', // 6 hours in seconds
  PICKUPS_TABLE = '',
} = process.env

const { Converter: { unmarshall } } = require('aws-sdk/clients/dynamodb')
const dynamo = require('./utils/dynamoClient')
const { getAddressResult, getNextPickup } = require('./utils/fevClient')
const { sendNotification } = require('./utils/pushoverClient')

/**
 * @returns {Date | false}
 */
const scheduleNextDate = async ({ addressQuery, pushoverUser }) => {
  const actualAddress = await getAddressResult(addressQuery)
  if (!actualAddress) {
    console.error('Could not find a matching address, aborting!')

    return false
  }

  const { strPickupAddress, strPickupCity } = actualAddress
  console.log(`Determined address to be "${strPickupAddress}, ${strPickupCity}". Fetching next pickup date.`)

  const nextPickupRaw = await getNextPickup({
    query: addressQuery,
    address: strPickupAddress,
    city: strPickupCity,
  })
  console.log(`Next pickup is "${nextPickupRaw.toJSON().split('T')[0]}"`)

  // schedule it by overwriting the record with a fresh ttl
  await dynamo.put({
    TableName: PICKUPS_TABLE,
    Item: {
      pushoverUser,
      addressQuery,
      ttlUnixSeconds: nextPickupRaw.valueOf() / 1000 - NOTIFICATION_MARGIN,
    },
  })
  console.log(`Overwritten with TTL ${nextPickupRaw.valueOf() / 1000 - NOTIFICATION_MARGIN}`)

  return nextPickupRaw
}

/**
 * @type {AWSLambda.DynamoDBStreamHandler}
 */
exports.handler = async ({ Records }) => {
  for (const record of Records) {
    // If it was a creation, lets just look up the next pickup and reschedule a notification for that time.
    if (record.eventName === 'INSERT') {
      const image = unmarshall(record.dynamodb.NewImage)

      const { addressQuery, pushoverUser } = image
      console.log(`Entry was inserted for "${addressQuery}". Fetching next pickup..`)

      const nextPickupRaw = await scheduleNextDate({ addressQuery, pushoverUser })
      if (!nextPickupRaw) continue

      // send confirmation to user
      await sendNotification({
        user: pushoverUser,
        message: `Subscribing to pickups at "${addressQuery}". Your next pickup is ${nextPickupRaw.toJSON().split('T')[0]}`,
      })
      console.log(`Sent initial notification for "${addressQuery}" (${nextPickupRaw.toJSON().split('T')[0]})`)

      continue
    }

    // If it was a deletion, we need to check if it was done manually or triggered by the TTL timer.
    // Manual deletions should be respected (i.e. ignored).
    // https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/time-to-live-ttl-streams.html
    if (record.eventName === 'REMOVE') {
      const image = unmarshall(record.dynamodb.OldImage)
      if (
        record.userIdentity &&
        record.userIdentity.type === 'Service' &&
        record.userIdentity.principalId === 'dynamodb.amazonaws.com'
      ) {
        const { addressQuery, pushoverUser, ttlUnixSeconds } = image

        const targetDate = new Date((ttlUnixSeconds + parseInt(NOTIFICATION_MARGIN, 10)) * 1000)

        // Send a notification and reschedule it with some margin.
        await sendNotification({
          user: pushoverUser,
          message: `Put the trash cans out for your pickup at ${targetDate.toJSON().split('T')[0]}`,
        })
        console.log(`Sent notification for "${addressQuery}"`)

        // Check when the next one is and schedule it.
        const nextPickupRaw = await scheduleNextDate({ addressQuery, pushoverUser })
        if (!nextPickupRaw) continue
      } else {
        console.log('Manually deleted entry', image)
      }
    }
  }
}
