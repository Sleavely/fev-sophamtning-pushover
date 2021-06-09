const {
  AWS_REGION = 'eu-west-1',
} = process.env

const { DynamoPlus } = require('dynamo-plus')

module.exports = exports = DynamoPlus({ region: AWS_REGION })
