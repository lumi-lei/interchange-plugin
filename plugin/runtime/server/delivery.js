import { createHmac } from 'node:crypto';
export function buildDingTalkSign(secret, timestamp) {
    const stringToSign = `${timestamp}\n${secret}`;
    return createHmac('sha256', secret).update(stringToSign, 'utf8').digest('base64');
}
export function buildDingTalkWebhookUrl(webhookUrl, secret, timestamp) {
    if (!secret)
        return webhookUrl;
    const url = new URL(webhookUrl);
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('sign', buildDingTalkSign(secret, timestamp));
    return url.toString();
}
function contentWithKeyword(content, keyword) {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword || content.includes(trimmedKeyword))
        return content;
    return `${trimmedKeyword}\n\n${content}`;
}
export function buildDeliveryRequest({ contact, content, sentAt = new Date(), timestamp = Date.now() }) {
    if (contact.deliveryType === 'dingtalk_robot') {
        const markdownText = contentWithKeyword(content, contact.dingtalkKeyword);
        return {
            deliveryType: 'dingtalk_robot',
            webhookUrl: buildDingTalkWebhookUrl(contact.webhookUrl, contact.dingtalkSecret, timestamp),
            payload: {
                msgtype: 'markdown',
                markdown: {
                    title: `Interchange - ${contact.name}`,
                    text: markdownText,
                },
            },
        };
    }
    return {
        deliveryType: 'generic_webhook',
        webhookUrl: contact.webhookUrl,
        payload: {
            source: 'interchange',
            recipient: contact.name,
            role: contact.roleKey,
            content,
            sentAt: sentAt.toISOString(),
        },
    };
}
