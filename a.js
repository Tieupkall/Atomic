require('dotenv').config();  // Đọc các biến từ file .env

const { MB } = require("mbbank");

async function ensureCryptoAndGetTransactions() {
  // Kiểm tra và polyfill crypto nếu chưa có sẵn
  if (typeof globalThis.crypto === "undefined") {
    try {
      globalThis.crypto = require('crypto');
      console.log("Crypto đã được polyfill thành công.");
    } catch (error) {
      console.error("Không thể polyfill crypto:", error);
      return;
    }
  } else {
    console.log("Crypto đã có sẵn trong môi trường.");
  }

  // Sử dụng bank_user và bank_pass từ file .env
  const bank_user = process.env.BANK_USER;  // Lấy từ .env
  const bank_pass = process.env.BANK_PASS;  // Lấy từ .env

  // Kiểm tra lại xem bank_user và bank_pass có phải là chuỗi hay không
  if (typeof bank_user !== 'string' || typeof bank_pass !== 'string') {
    console.error("Tài khoản hoặc mật khẩu phải là chuỗi (string).");
    return;
  }

  // Kiểm tra xem các giá trị tài khoản có hợp lệ không
  if (!bank_user || !bank_pass) {
    console.error("Tài khoản hoặc mật khẩu không hợp lệ.");
    return;
  }

  console.log("Tài khoản:", bank_user);  // Đã loại bỏ việc in mật khẩu
  // console.log("Mật khẩu:", bank_pass);

  const mb = new MB({
    username: bank_user,
    password: bank_pass,
    preferredOCRMethod: "default",
  });

  try {
    console.log("Gọi phương thức login...");

    // Đăng nhập vào hệ thống MB
    await mb.login();

    console.log("Đăng nhập thành công.");

    // Lấy lịch sử giao dịch
    const transactions = await mb.getTransactionsHistory({
      accountNumber: "1234567890",  // Thay bằng số tài khoản của bạn
      fromDate: "01/01/2025",       // Ngày bắt đầu
      toDate: "31/01/2025",         // Ngày kết thúc
    });

    if (!transactions || transactions.length === 0) {
      console.log("Không có giao dịch trong khoảng thời gian đã chọn.");
      return;
    }

    const max = 25;
    const lines = transactions.slice(0, max).map(t => {
      const date = t.transactionDate || t.date;
      const amount = t.amount || 0;
      const desc = t.description || "Không có mô tả";
      return `• ${date} | ${amount} VND | ${desc}`;
    }).join("\n");

    const more = transactions.length > max ? `\n… (${transactions.length - max} giao dịch nữa)` : "";

    const header = `📒 Lịch sử giao dịch MB\n• STK: 1234567890\n• Từ: 01/01/2025  Đến: 31/01/2025\n• Tổng: ${transactions.length} giao dịch\n\n`;

    console.log(header + lines + more);
  } catch (error) {
    console.error("Đăng nhập thất bại hoặc lấy lịch sử giao dịch lỗi:", error);
  }
}

// Gọi hàm để kiểm tra
ensureCryptoAndGetTransactions();