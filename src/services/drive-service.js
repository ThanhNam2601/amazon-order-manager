const { google } = require('googleapis');
const fs = require('fs').promises;
const config = require('../../config/config');

class DriveService {
    constructor() {
        this.drive = null;
        this.sheets = null;
        this.auth = null;
        this.spreadsheetId = config.storage.spreadsheetId; // Lấy từ config
    }

    // Khởi tạo service account
    async initialize() {
        try {
            const serviceAccount = JSON.parse(
                await fs.readFile(config.serviceAccount.credentials, 'utf8')
            );

            this.auth = new google.auth.GoogleAuth({
                credentials: serviceAccount,
                scopes: config.serviceAccount.scopes
            });

            this.drive = google.drive({ version: 'v3', auth: this.auth });
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });

            console.log('Drive service initialized successfully');
        } catch (error) {
            console.error('Error initializing Drive service:', error);
            throw error;
        }
    }

  // Tạo/Setup Google Sheets database
async createOrdersDatabase() {
    try {
        // Sử dụng spreadsheet ID từ config
        if (!this.spreadsheetId) {
            throw new Error('No spreadsheet ID found in config. Please create a Google Sheet and add the ID to config.');
        }

        console.log(`Setting up spreadsheet: ${this.spreadsheetId}`);

        // Kiểm tra xem sheet "Orders" có tồn tại không
        let ordersSheetExists = false;
        try {
            const spreadsheetInfo = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            
            ordersSheetExists = spreadsheetInfo.data.sheets.some(
                sheet => sheet.properties.title === 'Orders'
            );
        } catch (error) {
            console.log('Error checking sheets:', error.message);
        }

        // Tạo sheet "Orders" nếu chưa có
        if (!ordersSheetExists) {
            console.log('Creating "Orders" sheet...');
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: 'Orders',
                                gridProperties: {
                                    rowCount: 1000,
                                    columnCount: 15
                                }
                            }
                        }
                    }]
                }
            });
            console.log('Orders sheet created successfully');
        }

        // Kiểm tra xem đã có header chưa
        let hasHeaders = false;
        try {
            const existingData = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Orders!A1:O1'
            });
            
            if (existingData.data.values && existingData.data.values.length > 0) {
                console.log('Headers already exist');
                hasHeaders = true;
            }
        } catch (error) {
            console.log('No existing headers found, will create new ones...');
        }

        // Tạo header row nếu chưa có
        if (!hasHeaders) {
            const headers = [
                'Order ID', 'Date', 'Ship By', 'Item', 'SKU', 
                'Quantity', 'Price', 'Earnings', 'FFM Cost', 
                'Profit', 'Status', 'Created At', 'Updated At', 
                'Message ID', 'Notes'
            ];

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Orders!A1:O1',
                valueInputOption: 'RAW',
                resource: {
                    values: [headers]
                }
            });

            // Format header
            try {
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        requests: [{
                            repeatCell: {
                                range: {
                                    sheetId: await this.getSheetId('Orders'),
                                    startRowIndex: 0,
                                    endRowIndex: 1
                                },
                                cell: {
                                    userEnteredFormat: {
                                        backgroundColor: { red: 0.2, green: 0.6, blue: 1 },
                                        textFormat: { 
                                            foregroundColor: { red: 1, green: 1, blue: 1 },
                                            bold: true 
                                        }
                                    }
                                },
                                fields: 'userEnteredFormat(backgroundColor,textFormat)'
                            }
                        }]
                    }
                });
            } catch (formatError) {
                console.log('Header formatting failed, but headers created successfully');
            }

            console.log('Headers created successfully');
        }

        console.log(`Spreadsheet ready: ${this.spreadsheetId}`);
        return this.spreadsheetId;
    } catch (error) {
        console.error('Error setting up spreadsheet:', error);
        throw error;
    }
}

// Helper function để lấy sheet ID
async getSheetId(sheetName) {
    try {
        const spreadsheetInfo = await this.sheets.spreadsheets.get({
            spreadsheetId: this.spreadsheetId
        });
        
        const sheet = spreadsheetInfo.data.sheets.find(
            sheet => sheet.properties.title === sheetName
        );
        
        return sheet ? sheet.properties.sheetId : 0;
    } catch (error) {
        console.error('Error getting sheet ID:', error);
        return 0;
    }
}

    // Lưu đơn hàng vào Sheets
    async saveOrder(orderData) {
        try {
            if (!this.spreadsheetId) {
                throw new Error('No spreadsheet ID available');
            }

            // Kiểm tra xem đơn hàng đã tồn tại chưa
            const existingOrders = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Orders!A:A'
            });

            const existingOrderIds = existingOrders.data.values || [];
            const orderExists = existingOrderIds.some(row => row[0] === orderData.orderId);

            if (orderExists) {
                console.log(`Order ${orderData.orderId} already exists, skipping...`);
                return;
            }

            const now = new Date().toISOString();
            const row = [
                orderData.orderId,
                orderData.orderDate || '',
                orderData.shipBy || '',
                orderData.item || '',
                orderData.sku || '',
                orderData.quantity || 1,
                orderData.price || 0,
                orderData.earnings || 0,
                orderData.ffmCost || 0,
                orderData.profit || (orderData.earnings || 0) - (orderData.ffmCost || 0),
                orderData.status || 'new',
                now, // Created At
                now, // Updated At
                orderData.messageId || '',
                orderData.notes || ''
            ];

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Orders!A:O',
                valueInputOption: 'RAW',
                resource: {
                    values: [row]
                }
            });

            console.log(`Order saved: ${orderData.orderId}`);
        } catch (error) {
            console.error('Error saving order:', error);
            throw error;
        }
    }

    // Lấy tất cả đơn hàng từ Sheets
    async getAllOrders() {
        try {
            if (!this.spreadsheetId) {
                return [];
            }

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Orders!A2:O' // Bỏ qua header row
            });

            const rows = response.data.values || [];
            return rows.map(row => ({
                orderId: row[0] || '',
                orderDate: row[1] || '',
                shipBy: row[2] || '',
                item: row[3] || '',
                sku: row[4] || '',
                quantity: parseInt(row[5]) || 1,
                price: parseFloat(row[6]) || 0,
                earnings: parseFloat(row[7]) || 0,
                ffmCost: parseFloat(row[8]) || 0,
                profit: parseFloat(row[9]) || 0,
                status: row[10] || 'new',
                createdAt: row[11] || '',
                updatedAt: row[12] || '',
                messageId: row[13] || '',
                notes: row[14] || ''
            }));
        } catch (error) {
            console.error('Error getting orders:', error);
            return [];
        }
    }

    // Cập nhật FFM Cost và tính profit
    async updateOrderFFMCost(orderId, ffmCost) {
        try {
            // Tìm row chứa order ID
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Orders!A:A'
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row => row[0] === orderId);

            if (rowIndex === -1) {
                throw new Error(`Order ${orderId} not found`);
            }

            // Get earnings để tính profit
            const orderResponse = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `Orders!H${rowIndex + 1}` // Earnings column
            });

            const earnings = parseFloat(orderResponse.data.values?.[0]?.[0] || 0);
            const profit = earnings - parseFloat(ffmCost);

            // Update FFM Cost và Profit
            await this.sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                resource: {
                    valueInputOption: 'RAW',
                    data: [
                        {
                            range: `Orders!I${rowIndex + 1}`, // FFM Cost
                            values: [[parseFloat(ffmCost)]]
                        },
                        {
                            range: `Orders!J${rowIndex + 1}`, // Profit  
                            values: [[profit]]
                        },
                        {
                            range: `Orders!M${rowIndex + 1}`, // Updated At
                            values: [[new Date().toISOString()]]
                        }
                    ]
                }
            });

            console.log(`Updated FFM Cost for order ${orderId}: $${ffmCost}, Profit: $${profit}`);
            return { ffmCost: parseFloat(ffmCost), profit };
        } catch (error) {
            console.error('Error updating FFM cost:', error);
            throw error;
        }
    }

    // Lấy spreadsheet ID đã tạo
    getSpreadsheetId() {
        return this.spreadsheetId;
    }
}

module.exports = new DriveService();
