import { handleByokStatus } from '~~/server/utils/byok';

export default defineEventHandler(event => handleByokStatus(event, 'openai'));
