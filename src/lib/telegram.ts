import { supabase } from './supabase';
import { startOfDay, endOfDay } from 'date-fns';

export const sendDailyReportToTelegram = async (settings: any, currentUser: any): Promise<boolean> => {
  const { telegramBotToken, telegramChatId } = settings;
  
  if (!telegramBotToken || !telegramChatId) {
    return true; // Not configured, just proceed
  }

  try {
    const today = new Date();
    const todayStart = startOfDay(today).toISOString();
    const todayEnd = endOfDay(today).toISOString();

    // 1. Fetch Sales for today
    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('*')
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd)
      .eq('status', 'Completed');

    if (salesError) throw salesError;

    let cashSales = 0;
    let fibSales = 0;
    let debtSales = 0;

    sales?.forEach((sale: any) => {
      if (sale.payment_method === 'Cash') cashSales += sale.total_amount;
      if (sale.payment_method === 'FIB') fibSales += sale.total_amount;
      if (sale.payment_method === 'Debt') debtSales += sale.total_amount;
    });

    // 2. Fetch Debt Payments received today
    const { data: debtPayments, error: debtError } = await supabase
      .from('debt_payments')
      .select('amount')
      .gte('date', todayStart)
      .lte('date', todayEnd);

    if (debtError) throw debtError;
    const debtReceived = debtPayments?.reduce((sum, p) => sum + p.amount, 0) || 0;

    // 3. Fetch Expenses for today
    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select('amount')
      .gte('date', todayStart)
      .lte('date', todayEnd);

    if (expensesError) throw expensesError;
    const totalExpenses = expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;

    // Calculate Total Cash in Safe
    const totalSafe = cashSales + debtReceived - totalExpenses;

    const formattedDate = today.toLocaleDateString('en-GB');
    
    const message = `
📊 <b>ڕاپۆرتی داخستنی قاسە</b> 📊
📅 بەروار: ${formattedDate}
🏢 دوکان: ${settings.shopName || 'Soran Hookah'}

💵 فرۆشتنی نەقد: ${cashSales.toLocaleString('en-US')} IQD
💳 فرۆشتنی FIB: ${fibSales.toLocaleString('en-US')} IQD
📝 فرۆشتنی قەرز: ${debtSales.toLocaleString('en-US')} IQD

📥 قەرزی وەرگیراو: ${debtReceived.toLocaleString('en-US')} IQD
📉 خەرجییەکان: ${totalExpenses.toLocaleString('en-US')} IQD

💰 <b>پارەی نەقدی ناو قاسە: ${totalSafe.toLocaleString('en-US')} IQD</b>

👤 کارمەند: ${currentUser?.name || 'نەزانراو'}
    `.trim();

    const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      console.error('Telegram API Error:', await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending telegram report:', error);
    return false;
  }
};

export const testTelegramConnection = async (botToken: string, chatId: string): Promise<{ success: boolean; error?: string }> => {
  if (!botToken || !chatId) {
    return { success: false, error: 'تکایە Bot Token و Chat ID بنووسە' };
  }

  try {
    const testMsg = `🤖 <b>پشکنینی بۆتی تێلیگرام</b>\n\n✅ پەیوەندی نێوان سیستەمی <b>سۆران هۆکە شۆپ</b> و تێلیگرام کارایە و هیچ کێشەیەکی نییە.\n📅 کات: ${new Date().toLocaleString('ku-IQ')}`;
    
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: testMsg,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ description: 'Failed to send' }));
      return { success: false, error: errorData.description || 'هەڵە لە پەیوەندی لەگەڵ تێلیگرام' };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'پەیوەندی ئینتەرنێت پچڕاوە' };
  }
};

