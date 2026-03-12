import { admin } from '../config/firebase-config.js';

/**
 * Send a push notification to a single device token.
 */
export async function sendToToken(token, title, body, data = {}, imageUrl) {
  const message = {
    token,
    notification: { title, body, imageUrl },
    data,
    android: {
      priority: 'high',
      notification: imageUrl ? { imageUrl } : undefined
    },
    apns: {
      headers: { 'apns-priority': '10' },
      fcm_options: imageUrl ? { image: imageUrl } : undefined
    },
  };

  try {
    const resp = await admin.messaging().send(message);
    return resp;
  } catch (err) {
    if (
      err.code === 'messaging/registration-token-not-registered' ||
      (err.errorInfo && err.errorInfo.code === 'messaging/registration-token-not-registered')
    ) {
      console.warn('Token not registered, should be removed from DB:', token);
    }
    throw err;
  }
}

/**
 * Send a push notification to multiple device tokens (up to 500).
 */
export async function sendToTokens(tokens = [], title, body, data = {}, imageUrl) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [], responses: [] };
  }

  const message = {
    tokens,
    notification: { title, body, imageUrl },
    data,
    android: {
      priority: 'high',
      notification: imageUrl ? { imageUrl } : undefined
    },
    apns: {
      headers: { 'apns-priority': '10' },
      fcm_options: imageUrl ? { image: imageUrl } : undefined
    },
  };

  try {
    const resp = await admin.messaging().sendEachForMulticast(message);
    const invalidTokens = [];

    resp.responses.forEach((r, idx) => {
      if (!r.success) {
        const err = r.error;
        const isUnregistered =
          err?.code === 'messaging/registration-token-not-registered' ||
          err?.errorInfo?.code === 'messaging/registration-token-not-registered';
        if (isUnregistered) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    return {
      successCount: resp.successCount,
      failureCount: resp.failureCount,
      invalidTokens,
      responses: resp.responses,
    };
  } catch (err) {
    console.error('Batch send error:', err);
    throw err;
  }
}

/**
 * Send a push notification to a topic's subscribers.
 */
export async function sendToTopic(topic, title, body, data = {}, imageUrl) {
  if (!topic) {
    throw new Error('Topic is required');
  }

  const message = {
    topic,
    notification: { title, body, imageUrl },
    data,
    android: {
      priority: 'high',
      notification: imageUrl ? { imageUrl } : undefined
    },
    apns: {
      headers: { 'apns-priority': '10' },
      fcm_options: imageUrl ? { image: imageUrl } : undefined
    },
  };

  try {
    const resp = await admin.messaging().send(message);
    return resp;
  } catch (err) {
    console.error('Topic send error:', err);
    throw err;
  }
}
