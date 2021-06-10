const {
  PICKUPS_TABLE = '',
} = process.env

const { Converter: { unmarshall } } = require('aws-sdk/clients/dynamodb')
const dynamo = require('./utils/dynamoClient')
const { getAddressResult, getNextPickup } = require('./utils/fevClient')
const { sendNotification } = require('./utils/pushoverClient')

const ONE_DAY = 86400 // 24h in seconds
const NOTIFICATION_MARGIN = ONE_DAY / 4

/**
 * @returns {Date | false}
 */
const getNextDate = async (addressQuery) => {
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

  return nextPickupRaw
}

/**
 * @returns {Date | false}
 */
const scheduleNextDate = async (image) => {
  const { addressQuery } = image

  const nextPickupRaw = await getNextDate(addressQuery)
  if (!nextPickupRaw) {
    console.error('Unable to find next date. Nothing to schedule.')

    return false
  }

  // schedule it by overwriting the record with a fresh ttl
  await dynamo.put({
    TableName: PICKUPS_TABLE,
    Item: {
      ...image,
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

      const { addressQuery, pushoverUser, ttlUnixSeconds } = image

      // When its being rescheduled its actually being recreated, so we
      // differentiate between manually inserted by looking for TTL.
      // No TTL means it was manually inserted and should be initialized.
      if (ttlUnixSeconds) continue

      console.log(`Entry was inserted for "${addressQuery}". Fetching next pickup..`)

      const nextPickupRaw = await scheduleNextDate(image)
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
        const { addressQuery, pushoverUser, ttlUnixSeconds, isReschedule } = image

        if (isReschedule) {
          console.log(`"${addressQuery}" was picked up yesterday. Scheduling next reminder date.`)
          // Just check when the next one is and schedule it.
          delete image.isReschedule
          await scheduleNextDate(image)
          continue
        }

        const targetDate = new Date((ttlUnixSeconds + NOTIFICATION_MARGIN) * 1000)

        // Send a notification and reschedule it with some margin.
        // Lets not trust the TTL for the communicated targetDate;
        // this is primarily a fix for when the TTL has been tampered with.
        const actualTargetDate = await getNextDate(addressQuery)
        await sendNotification({
          user: pushoverUser,
          message: `Put the trash cans out for your pickup at ${actualTargetDate.toJSON().split('T')[0]}`,
        })
        console.log(`Sent notification for "${addressQuery}"`)

        // Now we cant check right away when the next pickup is because that'll be the date
        // we just sent a notification for, so lets reschedule this for the day after pickup.
        const rescheduledTtl = targetDate.valueOf() / 1000 + ONE_DAY + NOTIFICATION_MARGIN
        await dynamo.put({
          TableName: PICKUPS_TABLE,
          Item: {
            ...image,
            isReschedule: true,
            ttlUnixSeconds: rescheduledTtl,
          },
        })
        console.log(`Rescheduled next reminder lookup for the day after pickup (TTL ${rescheduledTtl})`)
      } else {
        console.log('Manually deleted entry', image)
      }
    }
  }
}
