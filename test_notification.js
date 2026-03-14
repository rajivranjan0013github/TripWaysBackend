import { admin } from './src/config/firebase-config.js';

async function sendNotification() {
  const token = "et_m396MiUyvqYhgyuqlBn:APA91bG-o7afM_WGgF555gKJXcmzvqqG3yW9SyNaVohdUQqmb_Wgk1si-ZFWyahf0Xz411m1UAl1QYcdGRK24VmmwJzsJk4cENbZP3p8SHL9NFUgn12Za2o";
  const message = {
    token,
    notification: {
      title: "Test Notification",
      body: "This is a test notification sent from the backend script."
    },
    android: {
      priority: 'high'
    },
    apns: {
      headers: { 'apns-priority': '10' }
    }
  };

  try {
    const resp = await admin.messaging().send(message);
  } catch (err) {
    console.error("Error sending notification:", err);
  }
}

sendNotification();
