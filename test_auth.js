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

    console.log("Getting client...");
    const client = await auth.getClient();
    console.log("Getting token...");
    const token = await client.getAccessToken();
    console.log("Token received successfully!");
    // substring for safety
    console.log("Token: ", token.token ? token.token.substring(0, 10) + "..." : null);
  } catch (error) {
    console.error("Auth error details:");
    console.error(error);
    if (error.response) {
      console.error("Response data:", await error.response.text());
    }
  }
}

testAuth();
