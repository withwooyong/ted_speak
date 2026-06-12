export { type AiClientConfig } from './src/config';
export { AiError } from './src/error';
export { transcribe, type AudioInput } from './src/stt';
export { getTurnFeedback, type ChatTurn, type TutorOptions } from './src/tutor';
export { buildTutorSystemPrompt } from './src/prompts';
export { synthesize, synthesizeStream, type StreamHandlers } from './src/tts';
