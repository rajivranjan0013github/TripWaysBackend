import { admin } from './src/config/firebase-config.js';

async function testTopicPush() {
  try {
    const response = await admin.messaging().send({
      topic: 'all_users',
      notification: {
        title: 'Topic Test',
        body: 'This is a topic test message'
      }
    });
    console.log("Topic push succeeded:", response);
  } catch (error) {
    console.error("Topic push failed:", error);
  }
}

testTopicPush();
