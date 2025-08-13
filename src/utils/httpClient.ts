import axios from 'axios'
import { Parser } from 'xml2js'

export const makeHttpRequest = async <T>(url: string): Promise<T> => {
  const res = await axios.get(url)
  const parser = new Parser()
  return parser.parseStringPromise(res.data)
}
