import { handleByokDisconnect } from '~~/server/utils/byok-keys';

export default defineEventHandler(event => handleByokDisconnect(event, 'openai'));
