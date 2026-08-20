import { config } from '../config.js';
import { deepSeekProvider } from './providers/deepseek.js';
const textProviders = {
    deepseek: deepSeekProvider,
};
export function resolveTextProvider(providerName = config.textModelProvider) {
    const normalizedProviderName = providerName.trim().toLowerCase();
    const provider = textProviders[normalizedProviderName];
    if (!provider) {
        const supported = Object.keys(textProviders).join(', ');
        const error = new Error(`Unsupported TEXT_MODEL_PROVIDER "${providerName}". Supported providers: ${supported}.`);
        Object.assign(error, { status: 503 });
        throw error;
    }
    return provider;
}
export async function generateDraft(input) {
    const response = await resolveTextProvider().generateDraft(input);
    return response.content;
}
export async function generateRoleSuggestion(input) {
    const response = await resolveTextProvider().generateRoleSuggestion(input);
    return response.content;
}
export async function recognizeRole(input) {
    return resolveTextProvider().recognizeRole(input);
}
