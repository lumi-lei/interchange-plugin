import { deepSeekProvider } from './ai/providers/deepseek.js';
export async function generateDraft(input) {
    const response = await deepSeekProvider.generateDraft(input);
    return response.content;
}
