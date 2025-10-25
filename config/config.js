const path = require('path');

module.exports = {
    // OAuth credentials cho Gmail
    oauth: {
        credentials: path.join(__dirname, 'oauth-credentials.json'),
        token: path.join(__dirname, 'token.json'),
        scopes: ['https://www.googleapis.com/auth/gmail.readonly']
    },
    
    // Service account cho Drive/Sheets
    serviceAccount: {
        credentials: path.join(__dirname, 'service-account.json'),
        scopes: [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/spreadsheets'
        ]
    },
    
// Amazon email settings
amazon: {
    senderEmail: 'seller-notification@amazon.com',  // Đổi từ ship-confirm
    subjectContains: 'Sold, ship now'               // Đổi từ 'order'
},
    
    // Data storage
    storage: {
        spreadsheetName: 'Amazon Orders Database',
          spreadsheetId: '1IDKMsZvy9_C3V2xrKn25iLNCbKezrmHps45Bq7gqYr8', // Thêm dòng này
        dataFolder: path.join(__dirname, '..', 'data')
    }
};
 
