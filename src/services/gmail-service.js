const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config/config');

class GmailService {
    constructor() {
        this.oauth2Client = null;
        this.gmail = null;
    }

    // Khởi tạo OAuth2 client
    async initialize() {
        try {
            const credentials = JSON.parse(
                await fs.readFile(config.oauth.credentials, 'utf8')
            );
            
            const { client_secret, client_id, redirect_uris } = credentials.web;
            
            this.oauth2Client = new google.auth.OAuth2(
                client_id,
                client_secret,
                redirect_uris[0]
            );

            // Kiểm tra xem đã có token chưa
            try {
                const token = JSON.parse(
                    await fs.readFile(config.oauth.token, 'utf8')
                );
                this.oauth2Client.setCredentials(token);
                this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
                console.log('Gmail service initialized successfully');
            } catch (error) {
                console.log('No existing token found. Need to authorize first.');
            }
        } catch (error) {
            console.error('Error initializing Gmail service:', error);
            throw error;
        }
    }

    // Tạo authorization URL
    getAuthUrl() {
        if (!this.oauth2Client) {
            throw new Error('OAuth2 client not initialized');
        }

        const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: config.oauth.scopes,
        });
        
        return authUrl;
    }

    // Xử lý authorization code
    async handleAuthCode(code) {
        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            this.oauth2Client.setCredentials(tokens);
            
            // Lưu token
            await fs.writeFile(config.oauth.token, JSON.stringify(tokens));
            
            this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
            console.log('Authorization successful!');
            
            return true;
        } catch (error) {
            console.error('Error handling auth code:', error);
            throw error;
        }
    }

    // Lấy danh sách email từ Amazon
    async getAmazonEmails(maxResults = 10) {
        if (!this.gmail) {
            throw new Error('Gmail not initialized. Please authorize first.');
        }

        try {
            const query = `from:${config.amazon.senderEmail} subject:${config.amazon.subjectContains}`;
            
            const response = await this.gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: maxResults
            });

            const messages = response.data.messages || [];
            console.log(`Found ${messages.length} Amazon emails`);
            
            return messages;
        } catch (error) {
            console.error('Error getting Amazon emails:', error);
            throw error;
        }
    }

    // Lấy chi tiết email
    async getEmailDetails(messageId) {
        if (!this.gmail) {
            throw new Error('Gmail not initialized');
        }

        try {
            const response = await this.gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full'
            });

            return this.parseAmazonEmail(response.data);
        } catch (error) {
            console.error('Error getting email details:', error);
            throw error;
        }
    }

    // Parse thông tin đơn hàng từ email Amazon
    parseAmazonEmail(emailData) {
        try {
            const headers = emailData.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || '';
            const date = headers.find(h => h.name === 'Date')?.value || '';
            
            // Lấy body email
            let body = '';
            if (emailData.payload.body.data) {
                body = Buffer.from(emailData.payload.body.data, 'base64').toString();
            } else if (emailData.payload.parts) {
                const textPart = emailData.payload.parts.find(part => 
                    part.mimeType === 'text/plain' || part.mimeType === 'text/html'
                );
                if (textPart && textPart.body.data) {
                    body = Buffer.from(textPart.body.data, 'base64').toString();
                }
            }

            // Extract thông tin đơn hàng
            const orderInfo = this.extractOrderInfo(body, subject);
            
            return {
                messageId: emailData.id,
                subject,
                date,
                body,
                orderInfo
            };
        } catch (error) {
            console.error('Error parsing Amazon email:', error);
            return null;
        }
    }

    // Extract thông tin đơn hàng từ body email
extractOrderInfo(body, subject) {
    const orderInfo = {};

    // Extract Order ID từ subject với pattern linh hoạt hơn
    let orderIdMatch = subject.match(/([0-9]{3}-[0-9]{7}-[0-9]{6,7})/);
    if (!orderIdMatch) {
        // Thử pattern khác
        orderIdMatch = body.match(/Order ID[:\s]*([0-9]{3}-[0-9]{7}-[0-9]{6,7})/i);
    }
    if (!orderIdMatch) {
        // Thử pattern tổng quát hơn
        orderIdMatch = body.match(/([0-9]{3}-[0-9]{6,8}-[0-9]{6,8})/);
    }
    if (orderIdMatch) {
        orderInfo.orderId = orderIdMatch[1];
    }

    // Extract SKU từ subject
    const skuMatch = subject.match(/(TN[0-9A-Z]+)/i);
    if (skuMatch) {
        orderInfo.sku = skuMatch[1];
    }

    // Extract product name từ subject (sau SKU)
    const productMatch = subject.match(/TN[0-9A-Z]+\s+(.+?)(?:\s*,|$)/i);
    if (productMatch) {
        orderInfo.item = productMatch[1].trim();
    }

    // Parse HTML body để tìm thông tin chi tiết
    const htmlContent = body;

    // Extract Order ID từ HTML nếu chưa tìm thấy
    if (!orderInfo.orderId) {
        const htmlOrderMatch = htmlContent.match(/Order ID[:\s]*([0-9-]+)/i);
        if (htmlOrderMatch) {
            orderInfo.orderId = htmlOrderMatch[1];
        }
    }

    // Extract Order Date
    const orderDateMatch = htmlContent.match(/Order date[:\s]*([0-9\/]+)/i);
    if (orderDateMatch) {
        orderInfo.orderDate = orderDateMatch[1];
    }

    // Extract Ship by date  
    const shipByMatch = htmlContent.match(/Ship by[:\s]*([0-9\/]+)/i);
    if (shipByMatch) {
        orderInfo.shipBy = shipByMatch[1];
    }

    // Extract Quantity
    const quantityMatch = htmlContent.match(/Quantity[:\s]*([0-9]+)/i);
    if (quantityMatch) {
        orderInfo.quantity = parseInt(quantityMatch[1]);
    } else {
        orderInfo.quantity = 1; // Default
    }

    // Extract Price
    const priceMatch = htmlContent.match(/Price[:\s]*\$([0-9.]+)/i);
    if (priceMatch) {
        orderInfo.price = parseFloat(priceMatch[1]);
    }

    // Extract Your earnings
    const earningsMatch = htmlContent.match(/Your earnings[:\s]*\$([0-9.]+)/i);
    if (earningsMatch) {
        orderInfo.earnings = parseFloat(earningsMatch[1]);
    }

    // Nếu không có earnings, thử extract từ các pattern khác
    if (!orderInfo.earnings) {
        const altEarningsMatch = htmlContent.match(/\$([0-9.]+)/g);
        if (altEarningsMatch && altEarningsMatch.length > 0) {
            // Lấy số tiền cuối cùng (thường là earnings)
            const lastAmount = altEarningsMatch[altEarningsMatch.length - 1].replace('$', '');
            orderInfo.earnings = parseFloat(lastAmount);
        }
    }

    // Thêm thông tin từ subject nếu không tìm thấy trong body
    if (!orderInfo.item && subject) {
        // Extract product name từ subject
        const subjectItemMatch = subject.match(/TN[0-9A-Z]+\s+(.+?)(?:\s*Personalized|$)/i);
        if (subjectItemMatch) {
            orderInfo.item = subjectItemMatch[1].trim();
        }
    }

    return orderInfo;
}


}

module.exports = new GmailService();
 
