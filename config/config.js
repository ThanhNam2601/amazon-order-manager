const path = require('path');
const fs = require('fs');

// Decode credentials from environment in production
function getCredentialPath(envVar, filename) {
    if (process.env.NODE_ENV === 'production' && process.env[envVar]) {
        try {
            const credentialsData = Buffer.from(process.env[envVar], 'base64').toString('utf8');
            const tempPath = path.join('/tmp', filename);
            fs.writeFileSync(tempPath, credentialsData);
            console.log(`Created temp credential file: ${tempPath}`);
            return tempPath;
        } catch (error) {
            console.error(`Error creating credential file ${filename}:`, error.message);
            throw error;
        }
    }
    return path.join(__dirname, filename);
}

module.exports = {
    // OAuth credentials cho Gmail
    oauth: {
        credentials: getCredentialPath('OAUTH_CREDENTIALS_BASE64', 'oauth-credentials.json'),
        token: process.env.NODE_ENV === 'production' ? '/tmp/token.json' : path.join(__dirname, 'token.json'),
        scopes: ['https://www.googleapis.com/auth/gmail.readonly']
    },
    
    // Service account cho Drive/Sheets
    serviceAccount: {
        credentials: getCredentialPath('SERVICE_ACCOUNT_BASE64', 'service-account.json'),
        scopes: [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/spreadsheets'
        ]
    },
    
    // Amazon email settings
    amazon: {
        senderEmail: 'seller-notification@amazon.com',
        subjectContains: 'Sold, ship now'
    },
    
    // Data storage
    storage: {
        spreadsheetName: 'Amazon Orders Database',
        spreadsheetId: '1IDKMsZvy9_C3V2xrKn25iLNCbKezrmHps45Bq7gqYr8',
        dataFolder: process.env.NODE_ENV === 'production' ? '/tmp/data' : path.join(__dirname, '..', 'data')
    }
};
