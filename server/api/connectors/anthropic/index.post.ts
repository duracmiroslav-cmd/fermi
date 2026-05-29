import { handleByokConnect } from '~~/server/utils/byok';

export default defineEventHandler(event => handleByokConnect(event, 'anthropic'));
