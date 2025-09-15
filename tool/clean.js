
const fs = require('fs');
const path = require('path');

// Đường dẫn đến thư mục cache
const cacheDir = '../modules/commands/cache';

// Danh sách các file và thư mục cần kiểm tra
const modulesDir = '../modules';

// Hàm đọc tất cả file .js trong thư mục
function getAllJSFiles(dir) {
  let jsFiles = [];
  
  function traverse(currentDir) {
    const files = fs.readdirSync(currentDir);
    
    for (const file of files) {
      const filePath = path.join(currentDir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        traverse(filePath);
      } else if (file.endsWith('.js')) {
        jsFiles.push(filePath);
      }
    }
  }
  
  traverse(dir);
  return jsFiles;
}

// Hàm đọc tất cả file JSON trong cache
function getAllJSONFiles(dir) {
  let jsonFiles = [];
  
  function traverse(currentDir) {
    const files = fs.readdirSync(currentDir);
    
    for (const file of files) {
      const filePath = path.join(currentDir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        traverse(filePath);
      } else if (file.endsWith('.json')) {
        jsonFiles.push(filePath);
      }
    }
  }
  
  if (fs.existsSync(dir)) {
    traverse(dir);
  }
  return jsonFiles;
}

// Hàm kiểm tra file JSON có được sử dụng không
function isJSONFileUsed(jsonFilePath, jsFiles) {
  const jsonFileName = path.basename(jsonFilePath, '.json');
  const relativePath = path.relative('./', jsonFilePath);
  
  for (const jsFile of jsFiles) {
    try {
      const content = fs.readFileSync(jsFile, 'utf8');
      
      // Kiểm tra các pattern có thể tham chiếu đến file JSON
      const patterns = [
        jsonFileName,
        relativePath,
        jsonFilePath,
        path.basename(jsonFilePath),
        // Kiểm tra require hoặc import
        `"${jsonFileName}"`,
        `'${jsonFileName}'`,
        `"${relativePath}"`,
        `'${relativePath}'`,
        // Kiểm tra fs.readFile, fs.writeFile
        `"${jsonFilePath}"`,
        `'${jsonFilePath}'`
      ];
      
      for (const pattern of patterns) {
        if (content.includes(pattern)) {
          return true;
        }
      }
    } catch (error) {
      console.log(`Lỗi đọc file ${jsFile}:`, error.message);
    }
  }
  
  return false;
}

// Main function
async function cleanupUnusedJSON() {
  console.log('🔍 Bắt đầu kiểm tra file JSON không sử dụng...');
  
  // Lấy tất cả file JS
  const jsFiles = getAllJSFiles(modulesDir);
  console.log(`📁 Tìm thấy ${jsFiles.length} file JavaScript`);
  
  // Lấy tất cả file JSON trong cache
  const jsonFiles = getAllJSONFiles(cacheDir);
  console.log(`📄 Tìm thấy ${jsonFiles.length} file JSON trong cache`);
  
  const unusedFiles = [];
  const usedFiles = [];
  
  for (const jsonFile of jsonFiles) {
    const isUsed = isJSONFileUsed(jsonFile, jsFiles);
    
    if (isUsed) {
      usedFiles.push(jsonFile);
      console.log(`✅ Đang sử dụng: ${jsonFile}`);
    } else {
      unusedFiles.push(jsonFile);
      console.log(`❌ Không sử dụng: ${jsonFile}`);
    }
  }
  
  console.log('\n📊 Kết quả:');
  console.log(`✅ File đang sử dụng: ${usedFiles.length}`);
  console.log(`❌ File không sử dụng: ${unusedFiles.length}`);
  
  if (unusedFiles.length > 0) {
    console.log('\n🗑️ Các file JSON không sử dụng:');
    unusedFiles.forEach(file => console.log(`   - ${file}`));
    
    // Xóa file không sử dụng
    console.log('\n🔄 Bắt đầu xóa file không sử dụng...');
    let deletedCount = 0;
    
    for (const file of unusedFiles) {
      try {
        fs.unlinkSync(file);
        console.log(`🗑️ Đã xóa: ${file}`);
        deletedCount++;
      } catch (error) {
        console.log(`❌ Lỗi xóa ${file}:`, error.message);
      }
    }
    
    console.log(`\n✅ Hoàn thành! Đã xóa ${deletedCount}/${unusedFiles.length} file.`);
  } else {
    console.log('\n✅ Không có file JSON nào cần xóa!');
  }
}

// Chạy script
cleanupUnusedJSON().catch(console.error);
