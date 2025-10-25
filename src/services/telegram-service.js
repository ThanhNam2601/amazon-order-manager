const axios = require('axios');
require('dotenv').config();

class TelegramService {
    constructor() {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_CHAT_ID;
        this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
    }

    // Test bot connection
    async testConnection() {
        try {
            if (!this.botToken) {
                throw new Error('Telegram bot token not configured');
            }

            const response = await axios.get(`${this.baseUrl}/getMe`);
            
            if (response.data.ok) {
                console.log('Telegram bot connected successfully:', response.data.result.username);
                return response.data.result;
            } else {
                throw new Error('Failed to connect to Telegram bot');
            }
        } catch (error) {
            console.error('Telegram connection error:', error.message);
            throw error;
        }
    }

    // Send message to chat
    async sendMessage(message, options = {}) {
        try {
            if (!this.chatId) {
                throw new Error('Telegram chat ID not configured');
            }

            const payload = {
                chat_id: this.chatId,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...options
            };

            const response = await axios.post(`${this.baseUrl}/sendMessage`, payload);
            
            if (response.data.ok) {
                console.log('Message sent to Telegram successfully');
                return response.data.result;
            } else {
                throw new Error(`Telegram API error: ${response.data.description}`);
            }
        } catch (error) {
            console.error('Error sending Telegram message:', error.message);
            throw error;
        }
    }

    // Send new order notification
    async sendNewOrderNotification(orderData) {
        try {
            const message = this.formatOrderMessage(orderData);
            return await this.sendMessage(message);
        } catch (error) {
            console.error('Error sending order notification:', error.message);
            throw error;
        }
    }

    // Send bulk orders notification
    async sendBulkOrdersNotification(orders) {
        try {
            if (orders.length === 0) {
                return;
            }

            if (orders.length === 1) {
                return await this.sendNewOrderNotification(orders[0]);
            }

            const message = this.formatBulkOrdersMessage(orders);
            return await this.sendMessage(message);
        } catch (error) {
            console.error('Error sending bulk orders notification:', error.message);
            throw error;
        }
    }

    // Send daily summary
    async sendDailySummary(summaryData) {
        try {
            const message = this.formatDailySummaryMessage(summaryData);
            return await this.sendMessage(message);
        } catch (error) {
            console.error('Error sending daily summary:', error.message);
            throw error;
        }
    }

    // Format single order message
    formatOrderMessage(order) {
        const profit = (order.earnings || 0) - (order.ffmCost || 0);
        const profitEmoji = profit > 0 ? '💰' : (profit < 0 ? '❌' : '⚪');
        
        return `
🎉 <b>ĐƠN HÀNG MỚI!</b>

📦 <b>Order ID:</b> <code>${order.orderId}</code>
📅 <b>Ngày:</b> ${order.orderDate || 'N/A'}
🎯 <b>Sản phẩm:</b> ${this.truncateText(order.item, 50)}
🏷️ <b>SKU:</b> <code>${order.sku || 'N/A'}</code>
📊 <b>Số lượng:</b> ${order.quantity || 1}
💵 <b>Giá bán:</b> $${(order.price || 0).toFixed(2)}
💸 <b>Earnings:</b> $${(order.earnings || 0).toFixed(2)}
⏰ <b>Ship by:</b> ${order.shipBy || 'N/A'}
📋 <b>Status:</b> ${this.getStatusEmoji(order.status)} ${order.status || 'new'}

${profitEmoji} <b>Profit dự kiến:</b> $${profit.toFixed(2)} ${profit > 0 ? '(Có lãi)' : profit < 0 ? '(Thua lỗ)' : '(Chưa có FFM cost)'}

<i>Vui lòng cập nhật FFM cost để tính profit chính xác!</i>
        `.trim();
    }

    // Format bulk orders message
    formatBulkOrdersMessage(orders) {
        const totalEarnings = orders.reduce((sum, order) => sum + (order.earnings || 0), 0);
        const totalOrders = orders.length;

        let message = `
🎉 <b>${totalOrders} ĐƠN HÀNG MỚI!</b>

💰 <b>Tổng earnings:</b> $${totalEarnings.toFixed(2)}
📦 <b>Tổng số đơn:</b> ${totalOrders}

<b>Chi tiết đơn hàng:</b>
`;

        orders.slice(0, 5).forEach((order, index) => {
            message += `
${index + 1}. <code>${order.orderId}</code>
   📦 ${this.truncateText(order.item, 30)}
   💸 $${(order.earnings || 0).toFixed(2)} | 🏷️ ${order.sku || 'N/A'}
`;
        });

        if (orders.length > 5) {
            message += `\n<i>... và ${orders.length - 5} đơn hàng khác</i>`;
        }

        message += `\n<i>Vào dashboard để xem chi tiết và cập nhật FFM cost!</i>`;

        return message.trim();
    }

    // Format daily summary message
    formatDailySummaryMessage(summary) {
        return `
📊 <b>BÁO CÁO NGÀY ${new Date().toLocaleDateString('vi-VN')}</b>

📦 <b>Tổng đơn hàng:</b> ${summary.totalOrders}
💰 <b>Tổng earnings:</b> $${summary.totalEarnings.toFixed(2)}
💸 <b>Tổng chi phí:</b> $${summary.totalCosts.toFixed(2)}
💵 <b>Lợi nhuận:</b> $${summary.netProfit.toFixed(2)}
📈 <b>Tỷ suất lợi nhuận:</b> ${summary.profitMargin.toFixed(1)}%

📋 <b>Trạng thái đơn hàng:</b>
• Mới: ${summary.statusCounts.new || 0}
• Đang xử lý: ${summary.statusCounts.processing || 0}
• Đã ship: ${summary.statusCounts.shipped || 0}
• Hoàn thành: ${summary.statusCounts.completed || 0}

<i>Chúc team một ngày làm việc hiệu quả! 🚀</i>
        `.trim();
    }

    // Get status emoji
    getStatusEmoji(status) {
        const statusEmojis = {
            'new': '🆕',
            'processing': '⚙️',
            'shipped': '🚚',
            'completed': '✅'
        };
        return statusEmojis[status] || '📋';
    }

    // Truncate text for display
    truncateText(text, maxLength) {
        if (!text) return 'N/A';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    // Get chat info (for setup)
    async getChatInfo() {
        try {
            if (!this.chatId) {
                throw new Error('Chat ID not configured');
            }

            const response = await axios.get(`${this.baseUrl}/getChat`, {
                params: { chat_id: this.chatId }
            });

            if (response.data.ok) {
                return response.data.result;
            } else {
                throw new Error(`Failed to get chat info: ${response.data.description}`);
            }
        } catch (error) {
            console.error('Error getting chat info:', error.message);
            throw error;
        }
    }

    // Send test message
    async sendTestMessage() {
        const message = `
🤖 <b>TEST MESSAGE</b>

✅ Telegram bot đã kết nối thành công!
📱 Chat ID: <code>${this.chatId}</code>
⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}

<i>Bot sẵn sàng gửi thông báo đơn hàng!</i>
        `.trim();

        return await this.sendMessage(message);
    }
}

module.exports = new TelegramService();
 
