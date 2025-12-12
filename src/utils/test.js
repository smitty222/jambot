import 'dotenv/config'
import { getUserNicknameByUuid } from './API.js'

console.log('TTL_USER_TOKEN loaded?', !!process.env.TTL_USER_TOKEN)
console.log(await getUserNicknameByUuid('072b0bb3-518e-4422-97fd-13dc53e8ae7e'))
