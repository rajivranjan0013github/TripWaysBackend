import { GoogleAuth } from 'google-auth-library';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./src/config/service-account.json');

async function testFcmRaw() {
  try {
    const auth = new GoogleAuth({
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
      },
      projectId: serviceAccount.project_id,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    const projectId = serviceAccount.project_id;
    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const fcmToken = "et_m396MiUyvqYhgyuqlBn:APA91bG-o7afM_WGgF555gKJXcmzvqqG3yW9SyNaVohdUQqmb_Wgk1si-ZFWyahf0Xz411m1UAl1QYcdGRK24VmmwJzsJk4cENbZP3p8SHL9NFUgn12Za2o";

    const payload = {
      message: {
        token: fcmToken,
        notification: {
          title: "Test Native API",
          body: "Direct HTTP v1 fetch."
        }
      }
    };

    console.log("Sending to FCM...");
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log("FCM Response Status:", response.status);
    console.log("FCM Response Data:", JSON.stringify(data, null, 2));

  } catch (error) {
    console.error("Error:", error);
  }
}

testFcmRaw();
