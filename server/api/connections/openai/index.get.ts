import { handleByokStatus } from '~~/server/utils/byok-keys';

export default defineEventHandler(event => handleByokStatus(event, 'openai'));
