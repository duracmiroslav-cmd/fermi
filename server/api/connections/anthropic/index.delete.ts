import { handleByokDisconnect } from '~~/server/utils/byok';

export default defineEventHandler(event => handleByokDisconnect(event, 'anthropic'));
