import { GoogleAuth } from 'google-auth-library';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./src/config/service-account.json');

async function testAuth() {
  try {
    const auth = new GoogleAuth({
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
      },
      projectId: serviceAccount.project_id,
      scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase.messaging'],
    });

    const client = await auth.getClient();
    const token = await client.getAccessToken();
    // substring for safety
  } catch (error) {
    console.error("Auth error details:");
    console.error(error);
    if (error.response) {
      console.error("Response data:", await error.response.text());
    }
  }
}

testAuth();
