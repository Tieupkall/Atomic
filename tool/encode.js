const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

// ✅ Danh sách các file cần mã hoá
const filesToObfuscate = [
  //path.join(__dirname, 'index.js'),
  path.join(__dirname, '../node_modules/a-comic/index.js')
];

// ✅ Cấu hình mã hoá
const options = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 1,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 1,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayWrappersType: 'variable',
  splitStrings: true,
  splitStringsChunkLength: 4,
  renameGlobals: true,
  selfDefending: true,
  disableConsoleOutput: true,
  debugProtection: true,
  debugProtectionInterval: 2000
};

// ✅ Thực thi mã hoá từng file
filesToObfuscate.forEach((file) => {
  if (!fs.existsSync(file)) {
    console.error(`❌ Không tìm thấy file: ${file}`);
    return;
  }

  const code = fs.readFileSync(file, 'utf8');
  const obfuscated = JavaScriptObfuscator.obfuscate(code, options);
  fs.writeFileSync(file, obfuscated.getObfuscatedCode(), 'utf8');
  console.log(`✅ File đã được mã hoá: ${file}`);
});