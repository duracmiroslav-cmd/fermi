import { handleByokConnect } from '~~/server/utils/byok-keys';

export default defineEventHandler(event => handleByokConnect(event, 'anthropic'));
