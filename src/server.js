const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();


const gmailService = require('./services/gmail-service');
const driveService = require('./services/drive-service');
const telegramService = require('./services/telegram-service');
const schedulerService = require('./services/scheduler-service');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Gmail authorization route
app.get('/auth/gmail', async (req, res) => {
    try {
        await gmailService.initialize();
        const authUrl = gmailService.getAuthUrl();
        res.redirect(authUrl);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Gmail callback route
app.get('/auth/callback', async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) {
            return res.status(400).send('No authorization code received');
        }

        await gmailService.handleAuthCode(code);
        res.send(`
            <h1>Authorization Successful!</h1>
            <p>Gmail access has been granted. You can now close this window.</p>
            <script>
                setTimeout(() => {
                    window.close();
                }, 3000);
            </script>
        `);
    } catch (error) {
        res.status(500).send(`Authorization failed: ${error.message}`);
    }
});
// API debug để xem raw email data
app.get('/api/debug-emails', async (req, res) => {
    try {
        await gmailService.initialize();
        const emails = await gmailService.getAmazonEmails(5);
        
        const debugData = [];
        for (const email of emails.slice(0, 2)) { // Chỉ lấy 2 email đầu để debug
            const details = await gmailService.getEmailDetails(email.id);
            debugData.push({
                messageId: details.messageId,
                subject: details.subject,
                date: details.date,
                bodyPreview: details.body.substring(0, 500), // 500 ký tự đầu
                extractedInfo: details.orderInfo
            });
        }
        
        res.json({
            success: true,
            rawData: debugData
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// API để test lấy email Amazon
app.get('/api/test-gmail', async (req, res) => {
    try {
        await gmailService.initialize();
        const emails = await gmailService.getAmazonEmails(5);
        
        const emailDetails = [];
        for (const email of emails.slice(0, 3)) { // Lấy 3 email đầu tiên để test
            const details = await gmailService.getEmailDetails(email.id);
            emailDetails.push(details);
        }
        
        res.json({
            success: true,
            count: emails.length,
            emails: emailDetails
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// API để lấy thông tin đơn hàng mới nhất
app.get('/api/orders/latest', async (req, res) => {
    try {
        await gmailService.initialize();
        const emails = await gmailService.getAmazonEmails(10);
        
        const orders = [];
        for (const email of emails) {
            const details = await gmailService.getEmailDetails(email.id);
            if (details && details.orderInfo.orderId) {
                orders.push({
                    messageId: details.messageId,
                    orderId: details.orderInfo.orderId,
                    orderDate: details.orderInfo.orderDate,
                    shipBy: details.orderInfo.shipBy,
                    item: details.orderInfo.item,
                    sku: details.orderInfo.sku,
                    quantity: details.orderInfo.quantity,
                    price: details.orderInfo.price,
                    earnings: details.orderInfo.earnings,
                    ffmCost: null, // Sẽ được nhập thủ công
                    profit: null,  // Sẽ được tính sau khi nhập FFM cost
                    status: 'new'
                });
            }
        }
        
        res.json({
            success: true,
            orders: orders
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// API để khởi tạo Google Sheets database
app.get('/api/init-database', async (req, res) => {
    try {
        await driveService.initialize();
        const spreadsheetId = await driveService.createOrdersDatabase();
        
        res.json({
            success: true,
            message: 'Database initialized successfully',
            spreadsheetId: spreadsheetId,
            url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API để sync đơn hàng từ Gmail lên Google Sheets
app.post('/api/sync-orders', async (req, res) => {
    try {
        await gmailService.initialize();
        await driveService.initialize();
        
        const emails = await gmailService.getAmazonEmails(20); // Lấy 20 email gần nhất
        const syncedOrders = [];
        
        for (const email of emails) {
            const details = await gmailService.getEmailDetails(email.id);
            if (details && details.orderInfo.orderId) {
                const orderData = {
                    orderId: details.orderInfo.orderId,
                    orderDate: details.orderInfo.orderDate,
                    shipBy: details.orderInfo.shipBy,
                    item: details.orderInfo.item,
                    sku: details.orderInfo.sku,
                    quantity: details.orderInfo.quantity,
                    price: details.orderInfo.price,
                    earnings: details.orderInfo.earnings,
                    ffmCost: 0,
                    profit: 0,
                    status: 'new',
                    messageId: details.messageId
                };
                
                await driveService.saveOrder(orderData);
                syncedOrders.push(orderData);
            }
        }
        
        res.json({
            success: true,
            message: `Synced ${syncedOrders.length} orders to Google Sheets`,
            orders: syncedOrders,
            spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${driveService.getSpreadsheetId()}`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API để lấy đơn hàng từ Google Sheets
app.get('/api/orders', async (req, res) => {
    try {
        await driveService.initialize();
        const orders = await driveService.getAllOrders();
        
        res.json({
            success: true,
            orders: orders
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API để cập nhật FFM Cost
app.post('/api/orders/:orderId/ffm-cost', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { ffmCost } = req.body;
        
        await driveService.initialize();
        const result = await driveService.updateOrderFFMCost(orderId, ffmCost);
        
        res.json({
            success: true,
            orderId: orderId,
            ffmCost: result.ffmCost,
            profit: result.profit
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API để lấy updates và tìm Chat ID
app.get('/api/telegram/get-chat-id', async (req, res) => {
    try {
        const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`);
        const data = await response.json();
        
        if (data.ok && data.result.length > 0) {
            const chats = data.result.map(update => ({
                chatId: update.message?.chat?.id,
                chatType: update.message?.chat?.type,
                chatTitle: update.message?.chat?.title,
                firstName: update.message?.chat?.first_name,
                username: update.message?.chat?.username,
                message: update.message?.text,
                date: new Date(update.message?.date * 1000).toLocaleString()
            })).filter(chat => chat.chatId);
            
            res.json({
                success: true,
                chats: chats,
                message: 'Send a message to your bot first, then call this API'
            });
        } else {
            res.json({
                success: false,
                message: 'No messages found. Please send a message to your bot first.',
                data: data
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


// API để test Telegram bot
app.get('/api/telegram/test', async (req, res) => {
    try {
        const botInfo = await telegramService.testConnection();
        await telegramService.sendTestMessage();
        
        res.json({
            success: true,
            message: 'Telegram bot connected and test message sent',
            botInfo: botInfo
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API để gửi thông báo đơn hàng mới
app.post('/api/telegram/notify-order', async (req, res) => {
    try {
        const { orderId } = req.body;
        
        if (!orderId) {
            return res.status(400).json({
                success: false,
                error: 'Order ID is required'
            });
        }

        await driveService.initialize();
        const orders = await driveService.getAllOrders();
        const order = orders.find(o => o.orderId === orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        await telegramService.sendNewOrderNotification(order);
        
        res.json({
            success: true,
            message: `Notification sent for order ${orderId}`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API để gửi báo cáo hàng ngày
app.post('/api/telegram/daily-summary', async (req, res) => {
    try {
        await driveService.initialize();
        const orders = await driveService.getAllOrders();
        
        // Calculate summary data
        const totalOrders = orders.length;
        const totalEarnings = orders.reduce((sum, order) => sum + order.earnings, 0);
        const totalCosts = orders.reduce((sum, order) => sum + order.ffmCost, 0);
        const netProfit = totalEarnings - totalCosts;
        const profitMargin = totalEarnings > 0 ? (netProfit / totalEarnings) * 100 : 0;
        
        const statusCounts = orders.reduce((counts, order) => {
            counts[order.status] = (counts[order.status] || 0) + 1;
            return counts;
        }, {});

        const summaryData = {
            totalOrders,
            totalEarnings,
            totalCosts,
            netProfit,
            profitMargin,
            statusCounts
        };

        await telegramService.sendDailySummary(summaryData);
        
        res.json({
            success: true,
            message: 'Daily summary sent to Telegram',
            summary: summaryData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Cập nhật sync-orders API để gửi thông báo Telegram
app.post('/api/sync-orders', async (req, res) => {
    try {
        await gmailService.initialize();
        await driveService.initialize();
        
        const emails = await gmailService.getAmazonEmails(20);
        const syncedOrders = [];
        
        for (const email of emails) {
            const details = await gmailService.getEmailDetails(email.id);
            if (details && details.orderInfo.orderId) {
                const orderData = {
                    orderId: details.orderInfo.orderId,
                    orderDate: details.orderInfo.orderDate,
                    shipBy: details.orderInfo.shipBy,
                    item: details.orderInfo.item,
                    sku: details.orderInfo.sku,
                    quantity: details.orderInfo.quantity,
                    price: details.orderInfo.price,
                    earnings: details.orderInfo.earnings,
                    ffmCost: 0,
                    profit: 0,
                    status: 'new',
                    messageId: details.messageId
                };
                
                await driveService.saveOrder(orderData);
                syncedOrders.push(orderData);
            }
        }
        
        // Gửi thông báo Telegram cho đơn hàng mới
        if (syncedOrders.length > 0) {
            try {
                await telegramService.sendBulkOrdersNotification(syncedOrders);
            } catch (telegramError) {
                console.error('Telegram notification failed:', telegramError.message);
                // Không fail toàn bộ request nếu Telegram lỗi
            }
        }
        
        res.json({
            success: true,
            message: `Synced ${syncedOrders.length} orders to Google Sheets`,
            orders: syncedOrders,
            spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${driveService.getSpreadsheetId()}`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API để quản lý scheduler
app.get('/api/scheduler/status', (req, res) => {
    try {
        const status = schedulerService.getJobStatus();
        res.json({
            success: true,
            jobs: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/scheduler/start/:jobName', (req, res) => {
    try {
        const { jobName } = req.params;
        schedulerService.startJob(jobName);
        res.json({
            success: true,
            message: `Job ${jobName} started`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/scheduler/stop/:jobName', (req, res) => {
    try {
        const { jobName } = req.params;
        schedulerService.stopJob(jobName);
        res.json({
            success: true,
            message: `Job ${jobName} stopped`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API để chạy manual sync
app.post('/api/manual-sync', async (req, res) => {
    try {
        const newOrders = await schedulerService.runAutoSync();
        res.json({
            success: true,
            message: `Manual sync completed: ${newOrders.length} new orders`,
            orders: newOrders
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Gmail authorization URL: http://localhost:3000/auth/gmail');
});

// Initialize services on startup
async function initializeServices() {
    try {
        await gmailService.initialize();
        await driveService.initialize();
        
        // Initialize scheduler in production
        if (process.env.NODE_ENV === 'production') {
            schedulerService.initializeJobs();
        }
        
        console.log('All services initialized successfully');
    } catch (error) {
        console.error('Error initializing services:', error);
    }
}

initializeServices();
