const path = require('path');
const fs = require('fs');

// Import loginModule
const loginModule = require('./includes/login/loginandby.js');

async function switchAccountShell() {
    try {
        const args = process.argv.slice(2);
        
        if (args.length === 0) {
            console.log('❌ Vui lòng cung cấp tên tài khoản hoặc số thứ tự');
            console.log('Cách sử dụng: node switch_account.js <tên_tài_khoản_hoặc_số_thứ_tự>');
            process.exit(1);
        }

        const input = args[0];
        const current = loginModule.getCurrentAccount();
        const accounts = loginModule.getAllAccounts();
        
        if (Object.keys(accounts).length === 0) {
            console.log('❌ Không tìm thấy tài khoản nào');
            process.exit(1);
        }

        // Hiển thị danh sách tài khoản
        if (input === 'list' || input === 'ls') {
            console.log('📱 Danh sách tài khoản:\n');
            let index = 1;
            for (const [name, data] of Object.entries(accounts)) {
                const status = name === current ? '🟢 (hiện tại)' : '⚪';
                const email = data.EMAIL || 'N/A';
                console.log(`${index}. ${status} ${name}`);
                console.log(`   📧 ${email}\n`);
                index++;
            }
            process.exit(0);
        }

        let targetAccount = null;
        const accountList = Object.keys(accounts);

        // Nếu input là số
        if (!isNaN(input)) {
            const index = parseInt(input) - 1;
            if (index >= 0 && index < accountList.length) {
                targetAccount = accountList[index];
            } else {
                console.log('❌ Số thứ tự không hợp lệ');
                process.exit(1);
            }
        } else {
            // Nếu input là tên tài khoản
            if (accounts[input]) {
                targetAccount = input;
            } else {
                console.log('❌ Không tìm thấy tài khoản:', input);
                process.exit(1);
            }
        }

        if (targetAccount === current) {
            console.log(`⚠️ Đã đang dùng tài khoản '${targetAccount}'`);
            process.exit(0);
        }

        console.log(`🔄 Đang chuyển sang tài khoản '${targetAccount}'...`);
        
        const result = await loginModule.switchAccount(targetAccount);
        
        if (result) {
            console.log(`✅ Đã chuyển sang tài khoản '${targetAccount}'`);
            console.log('🔄 Bot sẽ restart...');
        } else {
            console.log('❌ Chuyển đổi tài khoản thất bại');
            process.exit(1);
        }

    } catch (error) {
        console.log(`❌ Lỗi: ${error.message}`);
        process.exit(1);
    }
}

// Run
switchAccountShell();