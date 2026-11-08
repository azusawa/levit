/**
 * Levit AI tools, a separate entry point so editors without AI do not load them:
 *   import { getDocumentSchema } from '@yonailab/levit/ai';
 */
export { getDocumentSchema, validateDocument, type ValidationError } from './schema.js';
export { getAIContext, streamAIResponse, type AIContext } from './stream.js';
