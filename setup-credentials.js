const fs = require('fs');

try {
    // Read your credential files
    const oauthCreds = fs.readFileSync('./config/oauth-credentials.json', 'utf8');
    const serviceAccount = fs.readFileSync('./config/service-account.json', 'utf8');

    // Encode to base64
    const oauthBase64 = Buffer.from(oauthCreds).toString('base64');
    const serviceBase64 = Buffer.from(serviceAccount).toString('base64');

    console.log('=== COPY THESE TO RAILWAY VARIABLES ===');
    console.log('\nOAUTH_CREDENTIALS_BASE64:');
    console.log(oauthBase64);
    console.log('\nSERVICE_ACCOUNT_BASE64:');
    console.log(serviceBase64);
    console.log('\n=== END ===');
} catch (error) {
    console.error('Error reading files:', error.message);
}
