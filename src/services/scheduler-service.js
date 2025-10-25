const cron = require('node-cron');
const gmailService = require('./gmail-service');
const driveService = require('./drive-service');
const telegramService = require('./telegram-service');

class SchedulerService {
    constructor() {
        this.jobs = new Map();
    }

    // Khởi tạo tất cả scheduled jobs
    initializeJobs() {
        console.log('Initializing scheduler jobs...');

        // Auto sync orders every 30 minutes
        this.scheduleAutoSync();
        
        // Daily summary at 6 PM
        this.scheduleDailySummary();
        
        // Weekly report on Sunday
        this.scheduleWeeklyReport();

        console.log('All scheduler jobs initialized');
    }

    // Tự động sync đơn hàng mới mỗi 30 phút
    scheduleAutoSync() {
        const job = cron.schedule('*/30 * * * *', async () => {
            try {
                console.log('Running auto sync job...');
                await this.runAutoSync();
            } catch (error) {
                console.error('Auto sync job failed:', error);
            }
        }, {
            scheduled: false,
            timezone: "Asia/Ho_Chi_Minh"
        });

        this.jobs.set('autoSync', job);
        job.start();
        console.log('Auto sync job scheduled (every 30 minutes)');
    }

    // Báo cáo hàng ngày lúc 18:00
    scheduleDailySummary() {
        const job = cron.schedule('0 18 * * *', async () => {
            try {
                console.log('Running daily summary job...');
                await this.sendDailySummary();
            } catch (error) {
                console.error('Daily summary job failed:', error);
            }
        }, {
            scheduled: false,
            timezone: "Asia/Ho_Chi_Minh"
        });

        this.jobs.set('dailySummary', job);
        job.start();
        console.log('Daily summary job scheduled (6 PM daily)');
    }

    // Báo cáo tuần vào Chủ nhật 9:00
    scheduleWeeklyReport() {
        const job = cron.schedule('0 9 * * 0', async () => {
            try {
                console.log('Running weekly report job...');
                await this.sendWeeklyReport();
            } catch (error) {
                console.error('Weekly report job failed:', error);
            }
        }, {
            scheduled: false,
            timezone: "Asia/Ho_Chi_Minh"
        });

        this.jobs.set('weeklyReport', job);
        job.start();
        console.log('Weekly report job scheduled (Sunday 9 AM)');
    }

    // Thực hiện auto sync
    async runAutoSync() {
        try {
            await gmailService.initialize();
            await driveService.initialize();
            
            const emails = await gmailService.getAmazonEmails(10);
            const newOrders = [];
            
            // Get existing orders to avoid duplicates
            const existingOrders = await driveService.getAllOrders();
            const existingOrderIds = existingOrders.map(o => o.orderId);
            
            for (const email of emails) {
                const details = await gmailService.getEmailDetails(email.id);
                if (details && details.orderInfo.orderId && !existingOrderIds.includes(details.orderInfo.orderId)) {
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
                    newOrders.push(orderData);
                }
            }
            
            // Send Telegram notification for new orders
            if (newOrders.length > 0) {
                await telegramService.sendBulkOrdersNotification(newOrders);
                console.log(`Auto sync completed: ${newOrders.length} new orders found`);
            } else {
                console.log('Auto sync completed: No new orders');
            }
            
            return newOrders;
        } catch (error) {
            console.error('Auto sync failed:', error);
            throw error;
        }
    }

    // Gửi báo cáo hàng ngày
    async sendDailySummary() {
        try {
            await driveService.initialize();
            const orders = await driveService.getAllOrders();
            
            // Filter today's orders
            const today = new Date();
            const todayOrders = orders.filter(order => {
                if (!order.createdAt) return false;
                const orderDate = new Date(order.createdAt);
                return orderDate.toDateString() === today.toDateString();
            });
            
            const totalOrders = orders.length;
            const todayOrdersCount = todayOrders.length;
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
                todayOrdersCount,
                totalEarnings,
                totalCosts,
                netProfit,
                profitMargin,
                statusCounts
            };

            await telegramService.sendDailySummary(summaryData);
            console.log('Daily summary sent successfully');
        } catch (error) {
            console.error('Failed to send daily summary:', error);
            throw error;
        }
    }

    // Gửi báo cáo tuần
    async sendWeeklyReport() {
        try {
            await driveService.initialize();
            const orders = await driveService.getAllOrders();
            
            // Filter this week's orders
            const now = new Date();
            const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const weekOrders = orders.filter(order => {
                if (!order.createdAt) return false;
                const orderDate = new Date(order.createdAt);
                return orderDate >= weekStart;
            });
            
            const weeklyEarnings = weekOrders.reduce((sum, order) => sum + order.earnings, 0);
            const weeklyCosts = weekOrders.reduce((sum, order) => sum + order.ffmCost, 0);
            const weeklyProfit = weeklyEarnings - weeklyCosts;
            
            const message = `
📊 <b>BÁO CÁO TUẦN</b> (${weekStart.toLocaleDateString('vi-VN')} - ${now.toLocaleDateString('vi-VN')})

📦 <b>Đơn hàng tuần này:</b> ${weekOrders.length}
💰 <b>Earnings tuần:</b> $${weeklyEarnings.toFixed(2)}
💸 <b>Chi phí tuần:</b> $${weeklyCosts.toFixed(2)}
💵 <b>Lợi nhuận tuần:</b> $${weeklyProfit.toFixed(2)}

📈 <b>Tổng cộng tất cả:</b>
• Tổng đơn hàng: ${orders.length}
• Tổng earnings: $${orders.reduce((sum, order) => sum + order.earnings, 0).toFixed(2)}
• Tổng lợi nhuận: $${(orders.reduce((sum, order) => sum + order.earnings, 0) - orders.reduce((sum, order) => sum + order.ffmCost, 0)).toFixed(2)}

<i>Chúc team tuần mới thành công! 🚀</i>
            `.trim();

            await telegramService.sendMessage(message);
            console.log('Weekly report sent successfully');
        } catch (error) {
            console.error('Failed to send weekly report:', error);
            throw error;
        }
    }

    // Stop specific job
    stopJob(jobName) {
        const job = this.jobs.get(jobName);
        if (job) {
            job.stop();
            console.log(`Job ${jobName} stopped`);
        }
    }

    // Start specific job
    startJob(jobName) {
        const job = this.jobs.get(jobName);
        if (job) {
            job.start();
            console.log(`Job ${jobName} started`);
        }
    }

    // Stop all jobs
    stopAllJobs() {
        this.jobs.forEach((job, name) => {
            job.stop();
            console.log(`Job ${name} stopped`);
        });
    }

    // Get job status
    getJobStatus() {
        const status = {};
        this.jobs.forEach((job, name) => {
            status[name] = {
                running: job.running,
                scheduled: job.scheduled
            };
        });
        return status;
    }
}

module.exports = new SchedulerService();
