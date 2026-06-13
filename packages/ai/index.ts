export { type AiClientConfig } from './src/config';
export { AiError } from './src/error';
export { reliableFetch, type RequestOptions } from './src/reliability';
export {
  transcribe,
  transcribeDetailed,
  type AudioInput,
  type DetailedTranscript,
} from './src/stt';
export { getTurnFeedback, type ChatTurn, type TutorOptions } from './src/tutor';
export { buildTutorSystemPrompt } from './src/prompts';
export { synthesize, synthesizeStream, type StreamHandlers } from './src/tts';
