import got from 'got'

interface FevXhrErrorResponse {
  error: true
  message: string
}
interface FevXhrSuccessResponse<Payload = unknown> {
  error?: false
  payload: Payload
}
type FevXhrResponse<Payload = unknown> = FevXhrSuccessResponse<Payload> | FevXhrErrorResponse

interface GetAddressResultOutput {
  /**
   * @example "Lumsheden 75"
   */
  strPickupAddress: string
  /**
  * @example "Åshammar"
  */
  strPickupCity: string
}
/**
 * Search for an address, returns the first result or undefined.
 */
export const getAddressResult = async (query: string): Promise<GetAddressResultOutput | undefined> => {
  const queryParams = new URLSearchParams({
    // These param names seems dynamic but I'm not sure where they are derived from. fev.se deployment ID?
    'sv.12.24e83a616b997088b4cd546.route': '/',
    'sv.target': '12.24e83a616b997088b4cd546',
    query,
  })
  const baseUrl = 'https://fev.se/atervinning/sophamtning.html'

  const targetUrl = `${baseUrl}?${queryParams.toString()}`
  const { body } = await got.get<FevXhrResponse<GetAddressResultOutput[]>>(targetUrl, {
    responseType: 'json',
    headers: {
      accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  if (body.error) throw new Error(body.message)
  if (body.payload.length) return body.payload[0]
}

interface GetNextPickupInput {
  query: string
  address: string
  city: string
}
/**
 * Uses a verified address to check when the pickup will occur
 */
export const getNextPickup = async ({ query, address, city }: GetNextPickupInput): Promise<Date> => {
  const queryParams = new URLSearchParams({
    'sv.target': '12.24e83a616b997088b4cd546',
    'sv.12.24e83a616b997088b4cd546.route': '/',
    svAjaxReqParam: 'ajax',
    query,
    address,
    city,
  })
  const baseUrl = 'https://fev.se/atervinning/sophamtning.html'

  const targetUrl = `${baseUrl}?${queryParams.toString()}`
  const { body } = await got.get<FevXhrResponse<string>>(targetUrl, {
    responseType: 'json',
    headers: {
      accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  })

  if (body.error) throw new Error(body.message)

  return parseSwedishDate(body.payload)
}

export const swedishMonths = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']

/**
 * @private
 * @param {string} inputStr E.g. "tisdag 15 juni"
 */
export const parseSwedishDate = (inputStr: string, currentDate = new Date()): Date => {
  const [, inputDay, inputMonth] = inputStr.split(' ')

  const targetMonth = swedishMonths.indexOf(inputMonth.toLowerCase())
  const targetMonthPadded = `${targetMonth + 1}`.padStart(2, '0')

  // Cant use static because it might be next year
  const targetYear = currentDate.getFullYear() + (targetMonth < currentDate.getMonth() ? 1 : 0)

  const targetDate = new Date(`${targetYear}-${targetMonthPadded}-${inputDay.padStart(2, '0')}T00:00:00Z`)
  return targetDate
}
