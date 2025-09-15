const fs = require('fs');
const path = require('path'); 

// Đường dẫn files
const DATA_DIR = './data/tienhiep';
const PLAYERS_DIR = path.join(DATA_DIR, 'players');
const STAGES_PATH = path.join(DATA_DIR, 'stages.json');
const MONSTERS_PATH = path.join(DATA_DIR, 'monsters.json');
const EQUIPMENT_PATH = path.join(DATA_DIR, 'equipment.json');
const MENU_PATH = path.join(DATA_DIR, 'menu_config.json');
const CONFIG_PATH = path.join(DATA_DIR, 'game_config.json');

// Load data từ files
function loadData(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error);
    return null;
  }
}

function saveData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error);
    return false;
  }
}

// Load game data
const STAGES_DATA = loadData(STAGES_PATH);
const MONSTERS = loadData(MONSTERS_PATH);
const EQUIPMENT_LIST = loadData(EQUIPMENT_PATH);
const MENU_CONFIG = loadData(MENU_PATH);
const GAME_CONFIG = loadData(CONFIG_PATH);

const STAGES = STAGES_DATA?.stages || [];
const PHASES = STAGES_DATA?.phases || [];

// Helper functions
function getLevelName(level) {
  const stageIndex = Math.floor(level / 3);
  const phaseIndex = level % 3;

  if (stageIndex >= STAGES.length) {
    return `Viên Mãn ${STAGES[STAGES.length - 1]}`;
  }

  return `${STAGES[stageIndex]} ${PHASES[phaseIndex]}`;
}

function getDisplayLevelName(player) {
  const stageIndex = Math.floor(player.level / 3);
  const phaseIndex = player.level % 3;

  if (stageIndex >= STAGES.length) {
    return `${STAGES[STAGES.length - 1]} Viên Mãn`;
  }

  // Kiểm tra nếu đã full exp trong cảnh giới hiện tại và ở Đỉnh Phong
  if (player.exp >= getExpToLevel(player.level) && phaseIndex === 2) {
    return `${STAGES[stageIndex]} Đỉnh Phong (Viên Mãn)`;
  }

  return `${STAGES[stageIndex]} ${PHASES[phaseIndex]}`;
}

function getCurrentStage(level) {
  const stageIndex = Math.floor(level / 3);
  return STAGES[stageIndex] || STAGES[STAGES.length - 1];
}

function getCurrentPhase(level) {
  const phaseIndex = level % 3;
  return PHASES[phaseIndex];
}

function isReadyForTribulation(player) {
  // Chỉ có thể độ kiếp từ Trúc Cơ trở lên và khi đạt Đỉnh Phong với full exp
  const currentStage = getCurrentStage(player.level);
  const phaseIndex = player.level % 3;
  
  // Kiểm tra có phải cảnh giới Trúc Cơ trở lên (loại bỏ Luyện Khí và Phàm Nhân)
  const eligibleStages = ["Trúc Cơ", "Kim Đan", "Nguyên Anh", "Hóa Thần", "Anh Biến", "Vấn Đỉnh"];
  if (!eligibleStages.includes(currentStage)) {
    return false;
  }
  
  // Phải ở Đỉnh Phong (phaseIndex = 2) và đã đạt full exp
  return phaseIndex === 2 && player.exp >= getExpToLevel(player.level);
}

function attemptTribulation(player) {
  if (!isReadyForTribulation(player)) {
    return { success: false, reason: "Chưa đủ điều kiện độ kiếp" };
  }
  
  const currentStage = getCurrentStage(player.level);
  const success = Math.random() < 0.5; // 50% tỷ lệ thành công
  
  if (success) {
    // Thành công - lên cảnh giới mới
    player.level++;
    player.exp = 0;
    initializeCombatStats(player);
    
    return {
      success: true,
      message: `🌩️ ĐỘ KIẾP THÀNH CÔNG!\n⚡ Vượt qua lôi kiếp ${currentStage}, tiến vào ${getLevelName(player.level)}!`
    };
  } else {
    // Thất bại - bị thương đạo cơ
    player.injuredDaoCore = true;
    const injuredTime = new Date();
    injuredTime.setMinutes(injuredTime.getMinutes() + 30); // 30 phút không thể tu luyện
    player.daoCoreInjuredUntil = injuredTime.toISOString();
    
    return {
      success: false,
      message: `💥 ĐỘ KIẾP THẤT BẠI!\n⚡ Lôi kiếp ${currentStage} đã làm tổn thương đạo cơ!\n🩸 Cần đan dược chữa trị đạo cơ để tiếp tục tu luyện.`
    };
  }
}

function isDaoCoreInjured(player) {
  return player.daoCoreInjuredUntil && new Date(player.daoCoreInjuredUntil) > new Date();
}

function getDaoCoreInjuryTimeLeft(player) {
  if (!isDaoCoreInjured(player)) return 0;
  return Math.ceil((new Date(player.daoCoreInjuredUntil) - new Date()) / 60000);
}

function healDaoCore(player) {
  delete player.daoCoreInjuredUntil;
  delete player.injuredDaoCore;
}

function getExpToLevel(level) {
  const base = GAME_CONFIG?.experience?.baseExp || 100;
  const multiplier = GAME_CONFIG?.experience?.multiplier || 1.8;
  return Math.floor(base * Math.pow(multiplier, level));
}

function getMaxHp(level) {
  const baseHp = GAME_CONFIG?.combat?.basePlayerHp || 100;
  const hpPerLevel = GAME_CONFIG?.combat?.hpPerLevel || 20;
  return baseHp + (level * hpPerLevel);
}

function getMaxSpiritPower(level) {
  const baseSp = GAME_CONFIG?.combat?.baseSpiritPower || 100;
  const spPerLevel = GAME_CONFIG?.combat?.spiritPowerPerLevel || 10;
  return baseSp + (level * spPerLevel);
}

function getPlayerAttack(player) {
  let attack = 10 + (player.level * 2); // Sát thương cơ bản
  
  // Tính sát thương từ vũ khí trang bị (chỉ vũ khí phù hợp)
  const playerAvailableWeapons = player.inventory.filter(item => item.type === "vũ khí" && canUseWeapon(player, item));
  if (playerAvailableWeapons.length > 0) {
    // Lấy vũ khí có sát thương cao nhất trong những vũ khí có thể sử dụng
    const bestWeapon = playerAvailableWeapons.reduce((best, weapon) => 
      (weapon.attack || 0) > (best.attack || 0) ? weapon : best
    );
    attack += bestWeapon.attack || 0;
  }
  
  return attack;
}

function canHunt(player) {
  const spiritCost = GAME_CONFIG?.combat?.spiritPowerCostPerHunt || 10;
  return player.spiritPower >= spiritCost;
}

function consumeSpiritPower(player) {
  const spiritCost = GAME_CONFIG?.combat?.spiritPowerCostPerHunt || 10;
  player.spiritPower = Math.max(0, player.spiritPower - spiritCost);
}

function recoverSpiritPower(player) {
  if (player.spiritPowerRecoveryTime && new Date(player.spiritPowerRecoveryTime) <= new Date()) {
    const recoveryAmount = GAME_CONFIG?.combat?.spiritPowerRecoveryAmount || 10;
    player.spiritPower = Math.min(player.maxSpiritPower, player.spiritPower + recoveryAmount);
    
    // Đặt thời gian hồi phục tiếp theo (1 phút)
    const recoveryTime = new Date();
    recoveryTime.setMilliseconds(recoveryTime.getMilliseconds() + (GAME_CONFIG?.combat?.spiritPowerRecoveryTime || 60000));
    player.spiritPowerRecoveryTime = recoveryTime.toISOString();
  }
}

function initializeCombatStats(player) {
  // Khởi tạo máu và linh lực nếu chưa có
  if (typeof player.hp === 'undefined') {
    player.hp = getMaxHp(player.level);
    player.maxHp = getMaxHp(player.level);
  }
  if (typeof player.spiritPower === 'undefined') {
    player.spiritPower = getMaxSpiritPower(player.level);
    player.maxSpiritPower = getMaxSpiritPower(player.level);
  }
  
  // Cập nhật máu và linh lực tối đa theo level
  player.maxHp = getMaxHp(player.level);
  player.maxSpiritPower = getMaxSpiritPower(player.level);
  
  // Đảm bảo không vượt quá giới hạn
  player.hp = Math.min(player.hp, player.maxHp);
  player.spiritPower = Math.min(player.spiritPower, player.maxSpiritPower);
  
  // Khởi tạo thời gian hồi phục linh lực nếu chưa có
  if (!player.spiritPowerRecoveryTime) {
    const recoveryTime = new Date();
    recoveryTime.setMilliseconds(recoveryTime.getMilliseconds() + (GAME_CONFIG?.combat?.spiritPowerRecoveryTime || 60000));
    player.spiritPowerRecoveryTime = recoveryTime.toISOString();
  }
}

function dropEquipment(monster) {
  // Tính tỷ lệ rơi đồ cơ bản theo cấp độ quái
  let baseDropRate = monster.dropRate || 0.8; // Tỷ lệ rơi cơ bản
  
  // Tăng tỷ lệ rơi theo cấp độ yêu thú
  if (monster.beastLevel === "Phàm Thú") baseDropRate = Math.min(baseDropRate + 0.1, 0.9);
  else if (monster.beastLevel === "Yêu Thú") baseDropRate = Math.min(baseDropRate + 0.15, 0.95);
  else if (monster.beastLevel === "Linh Thú") baseDropRate = Math.min(baseDropRate + 0.2, 1.0);
  else if (monster.beastLevel === "Thánh Thú") baseDropRate = 1.0;
  else if (monster.beastLevel === "Yêu Vương") baseDropRate = 1.0;
  else if (monster.beastLevel === "Yêu Đế") baseDropRate = 1.0;
  else if (monster.beastLevel === "Thần Thú") baseDropRate = 1.0;

  if (Math.random() > baseDropRate) {
    return null; // Không rơi gì
  }

  // Chỉ rơi vật liệu để luyện đan - không rơi đan dược trực tiếp
  const materialDrop = getMonsterSpecificMaterials(monster);
  
  if (!materialDrop) {
    return null; // Không có vật liệu phù hợp
  }

  return materialDrop;
}

function getMonsterSpecificMaterials(monster) {
  const monsterName = monster.name.toLowerCase();
  const beastLevel = monster.beastLevel;
  
  // Load materials từ file materials.json
  const materials = loadData(path.join(DATA_DIR, 'materials.json')) || [];
  
  // Lọc vật liệu theo cấp độ yêu thú
  const suitableMaterials = materials.filter(material => material.beastLevel === beastLevel);
  
  let specificMaterials = [];

  // Định nghĩa vật liệu đặc trưng cho từng loài quái dựa trên materials.json
  if (monsterName.includes("lang") || monsterName.includes("sói")) {
    // Huyết Lang, Băng Tinh Sói: rơi Máu Lang, Lông Sói, Tinh Thể Băng
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Máu Lang" ||
      material.name === "Lông Sói" ||
      material.name === "Tinh Thể Băng"
    );
  } else if (monsterName.includes("giáp") || monsterName.includes("thiết")) {
    // Thiết Giáp Thú: rơi Vảy Thiết Giáp, Tinh Túy Hỗn Độn
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Vảy Thiết Giáp" ||
      material.name === "Tinh Túy Hỗn Độn"
    );
  } else if (monsterName.includes("hồn") || monsterName.includes("âm")) {
    // Âm Hồn: rơi Linh Hồn Âm, Ma Khí Tinh Túy
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Linh Hồn Âm" ||
      material.name === "Ma Khí Tinh Túy"
    );
  } else if (monsterName.includes("điểu") || monsterName.includes("kim sí")) {
    // Kim Sí Điểu: rơi Lông Kim Sí, Lông Phong Ảnh
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Lông Kim Sí" ||
      material.name === "Lông Phong Ảnh"
    );
  } else if (monsterName.includes("ưng") || monsterName.includes("phong ảnh")) {
    // Phong Ảnh Ưng: rơi Lông Phong Ảnh, Lôi Châu
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Lông Phong Ảnh" ||
      material.name === "Lôi Châu"
    );
  } else if (monsterName.includes("báo") || monsterName.includes("lôi điển")) {
    // Lôi Điển Báo: rơi Lôi Châu, Tinh Thể Băng
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Lôi Châu" ||
      material.name === "Tinh Thể Băng"
    );
  } else if (monsterName.includes("hầu") || monsterName.includes("ma hầu")) {
    // Xích Diệm Ma Hầu: rơi Máu Ma Hầu, Răng Ma Hầu
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Máu Ma Hầu" ||
      material.name === "Răng Ma Hầu"
    );
  } else if (monsterName.includes("long") || monsterName.includes("rồng")) {
    // Long Hồn, Thần Rồng: rơi Vảy Long Hồn, Long Cốt, Long Châu Thần
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Vảy Long Hồn" ||
      material.name === "Long Cốt" ||
      material.name === "Long Châu Thần"
    );
  } else if (monsterName.includes("phượng")) {
    // Phượng Hoàng: rơi Phượng Lông
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Phượng Lông"
    );
  } else if (monsterName.includes("lân") || monsterName.includes("kỳ")) {
    // Kỳ Lân: rơi Sừng Kỳ Lân
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Sừng Kỳ Lân"
    );
  } else if (monsterName.includes("vũ") || monsterName.includes("huyền")) {
    // Huyền Vũ: rơi Giáp Huyền Vũ
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Giáp Huyền Vũ"
    );
  } else if (monsterName.includes("hồ") || monsterName.includes("vĩ") || monsterName.includes("cửu vĩ")) {
    // Cửu Vĩ Hồ: rơi Tinh Hồn Cửu Vĩ
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Tinh Hồn Cửu Vĩ"
    );
  } else if (monsterName.includes("ma vương") || monsterName.includes("quỷ vương")) {
    // Ma Vương, Địa Ngục Quỷ Vương: rơi Ma Khí Tinh Túy, Địa Ngục Hỏa Chủng
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Ma Khí Tinh Túy" ||
      material.name === "Địa Ngục Hỏa Chủng"
    );
  } else if (monsterName.includes("thiên ma") || monsterName.includes("hoàng")) {
    // Thiên Ma Hoàng: rơi Thiên Ma Tinh Hoa
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Thiên Ma Tinh Hoa"
    );
  } else if (monsterName.includes("tuyệt thế") || monsterName.includes("yêu vương")) {
    // Tuyệt Thế Yêu Vương: rơi Tuyệt Thế Ma Huyết
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Tuyệt Thế Ma Huyết"
    );
  } else if (monsterName.includes("thái thượng") || monsterName.includes("yêu đế")) {
    // Thái Thượng Yêu Đế: rơi Thái Thượng Tinh Túy
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Thái Thượng Tinh Túy"
    );
  } else if (monsterName.includes("hỗn thiên")) {
    // Hỗn Thiên Yêu Đế: rơi Hỗn Thiên Bảo Châu
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Hỗn Thiên Bảo Châu"
    );
  } else if (monsterName.includes("vô cực")) {
    // Vô Cực Yêu Đế: rơi Vô Cực Tinh Thể
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Vô Cực Tinh Thể"
    );
  } else if (monsterName.includes("tối cường")) {
    // Tối Cường Yêu Đế: rơi Tối Cường Ma Hồn
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Tối Cường Ma Hồn"
    );
  } else if (monsterName.includes("thái cổ") && monsterName.includes("thần thú")) {
    // Thái Cổ Thần Thú: rơi Thái Cổ Thần Tủy
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Thái Cổ Thần Tủy"
    );
  } else if (monsterName.includes("hỗn độn") && monsterName.includes("thần thú")) {
    // Hỗn Độn Thần Thú: rơi Hỗn Độn Thần Tinh
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Hỗn Độn Thần Tinh"
    );
  } else if (monsterName.includes("vô thượng")) {
    // Vô Thượng Thần Thú: rơi Vô Thượng Thần Hoa
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Vô Thượng Thần Hoa"
    );
  } else if (monsterName.includes("tối cao")) {
    // Tối Cao Thần Thú: rơi Tối Cao Thần Nguyên
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Tối Cao Thần Nguyên"
    );
  } else if (monsterName.includes("thần") && monsterName.includes("rồng")) {
    // Thần Rồng: rơi Long Châu Thần
    specificMaterials = suitableMaterials.filter(material => 
      material.name === "Long Châu Thần"
    );
  }

  // Nếu không tìm thấy vật liệu đặc trưng, lấy ngẫu nhiên từ cùng cấp độ
  if (specificMaterials.length === 0) {
    specificMaterials = suitableMaterials;
  }

  // Nếu vẫn không có, trả về null
  if (specificMaterials.length === 0) {
    return null;
  }

  // Chọn ngẫu nhiên một vật liệu
  const randomIndex = Math.floor(Math.random() * specificMaterials.length);
  const selectedMaterial = specificMaterials[randomIndex];
  
  // Tạo object vật liệu với định dạng đồng bộ với materials.json
  return {
    name: selectedMaterial.name,
    type: "vật liệu",
    grade: getGradeFromRarity(selectedMaterial.rarity),
    rarity: selectedMaterial.rarity,
    description: selectedMaterial.description,
    sellPrice: selectedMaterial.value * 3, // Giá bán = value * 3
    buyPrice: selectedMaterial.value * 8,  // Giá mua = value * 8
    beastLevel: selectedMaterial.beastLevel,
    uses: selectedMaterial.uses,
    value: selectedMaterial.value // Giữ lại giá trị gốc từ materials.json
  };
}

function getGradeFromRarity(rarity) {
  const rarityToGrade = {
    "Thường": "phàm khí",
    "Hiếm": "pháp khí", 
    "Quý": "pháp khí",
    "Cực Hiếm": "linh khí",
    "Thần Thoại": "linh bảo",
    "Huyền Thoại": "linh bảo",
    "Vô Cực": "tiên khí",
    "Tối Thượng": "tiên khí"
  };
  return rarityToGrade[rarity] || "phàm khí";
}

// Đan dược giờ chỉ có được thông qua luyện đan - không rơi từ quái nữa

function getGenericDrop(monster) {
  // Hệ thống drop cũ làm fallback
  const suitableEquipment = EQUIPMENT_LIST.filter(eq => {
    const levelDiff = Math.abs((eq.minLevel || 0) - (monster.minLevel || 0));
    return levelDiff <= 4;
  });

  if (suitableEquipment.length === 0) {
    const allEquipment = EQUIPMENT_LIST.filter(eq => eq.type !== undefined);
    if (allEquipment.length === 0) return null;
    return allEquipment[Math.floor(Math.random() * allEquipment.length)];
  }

  const gradeWeights = {
    "phàm khí": 100,
    "pháp khí": 70,
    "linh khí": 40,
    "linh bảo": 20,
    "tiên khí": 5
  };

  if (monster.beastLevel === "Linh Thú") {
    gradeWeights["pháp khí"] = 100;
    gradeWeights["linh khí"] = 60;
  } else if (monster.beastLevel === "Thánh Thú") {
    gradeWeights["linh khí"] = 100;
    gradeWeights["linh bảo"] = 40;
  } else if (monster.beastLevel === "Yêu Vương") {
    gradeWeights["linh bảo"] = 100;
    gradeWeights["tiên khí"] = 30;
  } else if (monster.beastLevel === "Yêu Đế" || monster.beastLevel === "Thần Thú") {
    gradeWeights["tiên khí"] = 100;
    gradeWeights["linh bảo"] = 80;
  }

  const weightedItems = [];
  suitableEquipment.forEach(item => {
    const weight = gradeWeights[item.grade] || 10;
    for (let i = 0; i < weight; i++) {
      weightedItems.push(item);
    }
  });

  if (weightedItems.length === 0) {
    return suitableEquipment[Math.floor(Math.random() * suitableEquipment.length)];
  }

  return weightedItems[Math.floor(Math.random() * weightedItems.length)];
}

// Quản lý người chơi
function ensureDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PLAYERS_DIR)) {
    fs.mkdirSync(PLAYERS_DIR, { recursive: true });
  }
}

function getPlayerPath(userID) {
  return path.join(PLAYERS_DIR, `${userID}.json`);
}

function ensurePlayerFile(userID) {
  ensureDataDirectory();
  const playerPath = getPlayerPath(userID);
  if (!fs.existsSync(playerPath)) {
    // Người chơi mới - cần tạo nhân vật
    return false;
  }
  return true;
}

// Hệ thống linh căn
function generateSpiritRoot() {
  const rand = Math.random();
  
  // Tỷ lệ linh căn: Hạ phẩm 60%, Trung phẩm 30%, Thượng phẩm 10%
  if (rand < 0.6) {
    return {
      grade: "Hạ phẩm linh căn",
      multiplier: 1.0, // Exp bình thường
      description: "Linh căn tầm thường, tu luyện với tốc độ bình thường"
    };
  } else if (rand < 0.9) {
    return {
      grade: "Trung phẩm linh căn", 
      multiplier: 1.3, // +30% exp
      description: "Linh căn khá tốt, tu luyện nhanh hơn 30%"
    };
  } else {
    return {
      grade: "Thượng phẩm linh căn",
      multiplier: 1.6, // +60% exp
      description: "Linh căn xuất sắc, tu luyện nhanh hơn 60%"
    };
  }
}

function getSpiritRootIcon(grade) {
  const icons = {
    "Hạ phẩm linh căn": "🟫",
    "Trung phẩm linh căn": "🟨", 
    "Thượng phẩm linh căn": "🟩"
  };
  return icons[grade] || "⚪";
}

function createNewPlayer(userID, characterData) {
  ensureDataDirectory();
  const playerPath = getPlayerPath(userID);
  
  // Kiểm tra linh căn
  const spiritRoot = generateSpiritRoot();
  
  const defaultData = {
    userID: userID,
    name: characterData.name || 'TuChânGiả',
    level: 0,
    exp: 0,
    hp: 100,
    maxHp: 100,
    spiritPower: 100,
    maxSpiritPower: 100,
    inventory: [],
    spiritStones: 5000, // Tặng tân thủ 5000 linh thạch
    monsterLog: {},
    weaponType: characterData.weaponType, // Loại vũ khí chuyên biệt
    spiritRoot: spiritRoot, // Thêm thông tin linh căn
    characterCreated: true,
    settings: {
      autoSell: false,
      showDetailedStats: true,
      language: 'vi'
    },
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString()
  };
  
  saveData(playerPath, defaultData);
  return defaultData;
}

function createNewPlayerWithSpiritRoot(userID, characterData, spiritRoot) {
  ensureDataDirectory();
  const playerPath = getPlayerPath(userID);
  
  // Tạo vũ khí ban đầu dựa trên loại nhân vật
  let startingWeapon;
  switch(characterData.weaponType) {
    case "kiếm":
      startingWeapon = {
        name: "Phàm Khí Kiếm",
        type: "vũ khí",
        grade: "phàm khí",
        rarity: "thường",
        description: "Kiếm phàm thường cho tân thủ kiếm tu",
        attack: 15,
        sellPrice: 50,
        buyPrice: 120,
        minLevel: 0,
        level: 0,
        obtainedAt: new Date().toISOString()
      };
      break;
    case "đao":
      startingWeapon = {
        name: "Phàm Khí Đao",
        type: "vũ khí",
        grade: "phàm khí",
        rarity: "thường",
        description: "Đao phàm thường cho tân thủ đao tu",
        attack: 18,
        sellPrice: 55,
        buyPrice: 130,
        minLevel: 0,
        level: 0,
        obtainedAt: new Date().toISOString()
      };
      break;
    case "thể":
      startingWeapon = {
        name: "Thể Tu Quyền Thủ",
        type: "vũ khí",
        grade: "phàm khí",
        rarity: "thường",
        description: "Quyền thủ cơ bản cho thể tu",
        attack: 12,
        sellPrice: 40,
        buyPrice: 100,
        minLevel: 0,
        level: 0,
        obtainedAt: new Date().toISOString()
      };
      break;
    default:
      startingWeapon = {
        name: "Phàm Khí Kiếm",
        type: "vũ khí",
        grade: "phàm khí",
        rarity: "thường",
        description: "Kiếm phàm thường cho tân thủ",
        attack: 15,
        sellPrice: 50,
        buyPrice: 120,
        minLevel: 0,
        level: 0,
        obtainedAt: new Date().toISOString()
      };
  }
  
  const defaultData = {
    userID: userID,
    name: characterData.name || 'TuChânGiả',
    level: 0,
    exp: 0,
    hp: 100,
    maxHp: 100,
    spiritPower: 100,
    maxSpiritPower: 100,
    inventory: [startingWeapon], // Tặng vũ khí ban đầu
    spiritStones: 5000, // Tặng tân thủ 5000 linh thạch
    monsterLog: {},
    weaponType: characterData.weaponType, // Loại vũ khí chuyên biệt
    spiritRoot: spiritRoot, // Linh căn được chỉ định
    characterCreated: true,
    settings: {
      autoSell: false,
      showDetailedStats: true,
      language: 'vi'
    },
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString()
  };
  
  saveData(playerPath, defaultData);
  return defaultData;
}

function getWeaponTypes() {
  return [
    { id: 1, name: "Kiếm Tu", weaponType: "kiếm", description: "Tu luyện kiếm đạo, tấn công nhanh và chính xác" },
    { id: 2, name: "Đao Tu", weaponType: "đao", description: "Tu luyện đao pháp, sát thương mạnh và uy lực" },
    { id: 3, name: "Thể Tu", weaponType: "thể", description: "Tu luyện thể chất, có thể sử dụng mọi loại vũ khí" }
  ];
}

function checkCharacterNameExists(characterName) {
  ensureDataDirectory();
  if (!fs.existsSync(PLAYERS_DIR)) {
    return false;
  }
  
  const playerFiles = fs.readdirSync(PLAYERS_DIR);
  for (const file of playerFiles) {
    if (file.endsWith('.json')) {
      try {
        const playerData = loadData(path.join(PLAYERS_DIR, file));
        if (playerData && playerData.name && playerData.name.toLowerCase() === characterName.toLowerCase()) {
          return true;
        }
      } catch (error) {
        console.error(`Error reading player file ${file}:`, error);
      }
    }
  }
  return false;
}

function canUseWeapon(player, weapon) {
  // Kiểm tra loại vũ khí có phù hợp với nhân vật không
  if (!player.weaponType) return true; // Backward compatibility
  
  // Thể Tu có thể sử dụng mọi loại vũ khí
  if (player.weaponType === "thể") return true;
  
  // Lấy loại vũ khí từ tên vũ khí
  const weaponName = weapon.name.toLowerCase();
  
  // Kiểm tra từng loại vũ khí
  switch(player.weaponType) {
    case "kiếm":
      return weaponName.includes("kiếm") || weaponName.includes("gươm") || weaponName.includes("bảo kiếm") || weaponName.includes("thần kiếm");
    
    case "đao":
      return weaponName.includes("đao") || weaponName.includes("bảo đao") || weaponName.includes("thần đao") || weaponName.includes("ma đao");
    
    default:
      return false;
  }
}

function hasUsableWeapon(player) {
  const playerWeapons = player.inventory.filter(item => item.type === "vũ khí");
  return playerWeapons.some(weapon => canUseWeapon(player, weapon));
}

function loadPlayer(userID) {
  const playerExists = ensurePlayerFile(userID);
  if (!playerExists) {
    return null; // Người chơi mới cần tạo nhân vật
  }
  
  const playerPath = getPlayerPath(userID);
  const player = loadData(playerPath);
  if (player) {
    player.lastActive = new Date().toISOString();
    initializeCombatStats(player);
    recoverSpiritPower(player);
  }
  return player;
}

function savePlayer(userID, data) {
  const playerPath = getPlayerPath(userID);
  data.lastActive = new Date().toISOString();
  return saveData(playerPath, data);
}

function gainExp(player, amount) {
  const expNeeded = getExpToLevel(player.level);
  const currentStage = getCurrentStage(player.level);
  const phaseIndex = player.level % 3;
  
  // Không nhận exp nếu đã ở Đỉnh Phong và full exp từ Trúc Cơ trở lên
  if (player.exp >= expNeeded && phaseIndex === 2 && isReadyForTribulation(player)) {
    return 0; // Trả về 0 để báo hiệu không nhận được exp
  }
  
  // Áp dụng hệ số linh căn
  const spiritRootMultiplier = player.spiritRoot?.multiplier || 1.0;
  const boostedAmount = Math.floor(amount * spiritRootMultiplier);
  
  const oldExp = player.exp;
  player.exp += boostedAmount;
  
  // Kiểm tra level up tự động
  let levelsGained = 0;
  while (player.exp >= getExpToLevel(player.level)) {
    const currentExpNeeded = getExpToLevel(player.level);
    const currentPhase = player.level % 3;
    
    // Nếu đã ở Đỉnh Phong, đạt full exp và có thể độ kiếp thì dừng lại
    if (player.exp >= currentExpNeeded && currentPhase === 2 && isReadyForTribulation(player)) {
      player.exp = currentExpNeeded;
      break;
    }
    
    // Level up bình thường
    player.exp -= currentExpNeeded;
    player.level++;
    levelsGained++;
    
    // Cập nhật stats khi level up
    initializeCombatStats(player);
    
    // Giới hạn để tránh vòng lặp vô hạn
    if (levelsGained >= 10) break;
  }
  
  return player.exp + (levelsGained * 1000) - oldExp; // Trả về exp thực tế + bonus từ level up
}

function addEquipment(player, eq, quantity = 1) {
  // Tính giá cho vật liệu dựa trên value
  let sellPrice = eq.sellPrice || 1;
  let buyPrice = eq.buyPrice || (eq.sellPrice * 3) || 3;
  
  // Nếu là vật liệu có value, tính giá theo công thức chuẩn
  if (eq.type === "vật liệu" && eq.value) {
    sellPrice = eq.value * 3; // Giá bán = value * 3
    buyPrice = eq.value * 8;  // Giá mua = value * 8
  }
  
  // Đảm bảo vật phẩm có đầy đủ thuộc tính cần thiết
  const item = {
    name: eq.name || "Vật phẩm không tên",
    type: eq.type || "vật liệu",
    grade: eq.grade || "phàm khí",
    rarity: eq.rarity || "thường",
    description: eq.description || "Không có mô tả",
    sellPrice: sellPrice,
    buyPrice: buyPrice,
    obtainedAt: new Date().toISOString(),
    ...eq // Giữ lại các thuộc tính gốc
  };

  // Tự động bán nếu không phải đan dược và có cài đặt auto sell
  if (item.type !== "đan dược" && player.settings?.autoSell) {
    player.spiritStones += item.sellPrice * quantity;
    return; // Không thêm vào inventory
  }

  // Xử lý đặc biệt cho vật liệu - gộp quantity nếu cùng tên
  if (item.type === "vật liệu") {
    const existingItem = player.inventory.find(invItem => 
      invItem.name === item.name && 
      invItem.type === "vật liệu" && 
      invItem.grade === item.grade
    );
    
    if (existingItem) {
      // Nếu đã có vật liệu cùng loại, cộng quantity
      existingItem.quantity = (existingItem.quantity || 1) + quantity;
    } else {
      // Nếu chưa có, thêm mới với quantity
      item.quantity = quantity;
      player.inventory.push(item);
    }
  } else {
    // Với các loại khác (đan dược, vũ khí), thêm từng cái riêng biệt
    for (let i = 0; i < quantity; i++) {
      player.inventory.push({...item});
    }
  }
}

function isPlayerInjured(player) {
  return player.injuredUntil && new Date(player.injuredUntil) > new Date();
}

function injurePlayer(player) {
  const injuredTime = new Date();
  injuredTime.setMinutes(injuredTime.getMinutes() + 10); // 10 phút
  player.injuredUntil = injuredTime.toISOString();
}

function healPlayer(player) {
  delete player.injuredUntil;
}

function getInjuryTimeLeft(player) {
  if (!isPlayerInjured(player)) return 0;
  return Math.ceil((new Date(player.injuredUntil) - new Date()) / 60000);
}

function hasExpBoost(player) {
  return player.expBoostUntil && new Date(player.expBoostUntil) > new Date();
}

function hasInjuryImmunity(player) {
  return player.immunityUntil && new Date(player.immunityUntil) > new Date();
}

function applyPotionEffects(player, potion) {
  const now = new Date();

  // Hồi phục máu theo healAmount
  if (potion.healAmount) {
    if (potion.healAmount === 9999) {
      player.hp = player.maxHp; // Hồi phục hoàn toàn
    } else {
      player.hp = Math.min(player.maxHp, player.hp + potion.healAmount);
    }
  }

  // Hồi phục linh lực theo spiritPowerAmount
  if (potion.spiritPowerAmount) {
    if (potion.spiritPowerAmount === 9999) {
      player.spiritPower = player.maxSpiritPower; // Hồi phục hoàn toàn
    } else {
      player.spiritPower = Math.min(player.maxSpiritPower, player.spiritPower + potion.spiritPowerAmount);
    }
  }

  // Xử lý đan dược chữa thương
  if (potion.subType === "chữa thương") {
    if (potion.healTime === 0) {
      healPlayer(player);
    } else {
      // Giảm thời gian bị thương
      if (isPlayerInjured(player)) {
        const newInjuryTime = new Date(player.injuredUntil);
        newInjuryTime.setMilliseconds(newInjuryTime.getMilliseconds() - potion.healTime);
        if (newInjuryTime <= now) {
          healPlayer(player);
        } else {
          player.injuredUntil = newInjuryTime.toISOString();
        }
      }
    }
  }

  // Xử lý đan dược chữa đạo cơ
  if (potion.subType === "chữa đạo cơ" || potion.healDaoCore) {
    if (isDaoCoreInjured(player)) {
      healDaoCore(player);
    }
  }

  // Áp dụng hiệu ứng đặc biệt theo grade
  if (potion.grade === "linh khí") {
    // Tăng 20% exp trong 30 phút
    const expBoostTime = new Date(now);
    expBoostTime.setMinutes(expBoostTime.getMinutes() + 30);
    player.expBoostUntil = expBoostTime.toISOString();
    player.expBoostMultiplier = 1.2;
  } else if (potion.grade === "linh bảo") {
    // Miễn nhiễm bị thương 1 giờ + hồi phục linh lực
    const immunityTime = new Date(now);
    immunityTime.setHours(immunityTime.getHours() + 1);
    player.immunityUntil = immunityTime.toISOString();
    player.spiritPower = Math.min(player.maxSpiritPower, player.spiritPower + 50);
  } else if (potion.grade === "tiên khí") {
    // Tăng 50% exp + miễn nhiễm bị thương 2 giờ + hồi phục hoàn toàn linh lực + chữa đạo cơ
    const expBoostTime = new Date(now);
    expBoostTime.setHours(expBoostTime.getHours() + 2);
    player.expBoostUntil = expBoostTime.toISOString();
    player.expBoostMultiplier = 1.5;

    const immunityTime = new Date(now);
    immunityTime.setHours(immunityTime.getHours() + 2);
    player.immunityUntil = immunityTime.toISOString();
    
    player.spiritPower = player.maxSpiritPower; // Hồi phục hoàn toàn linh lực
    healDaoCore(player); // Chữa đạo cơ
  }
}

function gainExpWithBoost(player, amount) {
  // Không nhận exp nếu đã ở Đỉnh Phong và full exp từ Trúc Cơ trở lên
  const expNeeded = getExpToLevel(player.level);
  const phaseIndex = player.level % 3;
  if (player.exp >= expNeeded && phaseIndex === 2 && isReadyForTribulation(player)) {
    return { gained: 0, spiritRootBonus: false }; // Không nhận exp nếu đã Đỉnh Phong full exp và có thể độ kiếp
  }
  
  const oldLevel = player.level;
  let finalExp = amount;
  if (hasExpBoost(player)) {
    finalExp = Math.floor(amount * (player.expBoostMultiplier || 1));
  }
  
  const actualExpGained = gainExp(player, finalExp);
  const spiritRootBonus = player.spiritRoot?.multiplier > 1.0;
  
  // Thông báo level up nếu có
  if (player.level > oldLevel) {
    const levelsGained = player.level - oldLevel;
    console.log(`Player ${player.name} leveled up ${levelsGained} times! New level: ${getLevelName(player.level)}`);
  }
  
  return { gained: actualExpGained, spiritRootBonus: spiritRootBonus };
}

function formatTime(date) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

function getRandomMonster(playerLevel) {
  // Xác định cảnh giới hiện tại của người chơi
  const playerStageIndex = Math.floor(playerLevel / 3);
  const playerStageName = STAGES[playerStageIndex] || STAGES[STAGES.length - 1];
  
  // Xác định cấp bậc yêu thú tối đa có thể gặp theo mapping chính xác
  const stageToBeastMapping = {
    "Phàm Nhân": "Phàm Thú",
    "Luyện Khí": "Phàm Thú", // Luyện Khí chỉ gặp Phàm Thú
    "Trúc Cơ": "Yêu Thú",
    "Kim Đan": "Linh Thú", 
    "Nguyên Anh": "Thánh Thú",
    "Hóa Thần": "Yêu Vương",
    "Anh Biến": "Yêu Đế",
    "Vấn Đỉnh": "Thần Thú"
  };
  
  const maxBeastLevel = stageToBeastMapping[playerStageName] || "Phàm Thú";

  // Lọc quái theo cảnh giới tối đa có thể gặp
  const beastLevelOrder = ["Phàm Thú", "Yêu Thú", "Linh Thú", "Thánh Thú", "Yêu Vương", "Yêu Đế", "Thần Thú"];
  const maxBeastIndex = beastLevelOrder.indexOf(maxBeastLevel);
  
  let availableMonsters = MONSTERS.filter(monster => {
    const monsterBeastIndex = beastLevelOrder.indexOf(monster.beastLevel);
    return monsterBeastIndex <= maxBeastIndex;
  });

  // Nếu không có quái phù hợp, lấy quái cấp thấp nhất
  if (availableMonsters.length === 0) {
    availableMonsters = MONSTERS.filter(monster => monster.beastLevel === "Phàm Thú");
  }

  // Phân loại quái theo cấp độ
  const sameLevel = availableMonsters.filter(monster => monster.beastLevel === maxBeastLevel);
  const lowerLevel = availableMonsters.filter(monster => {
    const monsterBeastIndex = beastLevelOrder.indexOf(monster.beastLevel);
    return monsterBeastIndex < maxBeastIndex;
  });
  
  // Tìm yêu thú cấp cao hơn 1 bậc (nếu có)
  const higherLevelIndex = maxBeastIndex + 1;
  const higherLevel = higherLevelIndex < beastLevelOrder.length ? 
    MONSTERS.filter(monster => monster.beastLevel === beastLevelOrder[higherLevelIndex]) : [];

  const rand = Math.random();
  
  // 10% gặp yêu thú cấp cao hơn (nếu có và không phải cấp tối đa)
  if (higherLevel.length > 0 && rand < 0.1) {
    const randomIndex = Math.floor(Math.random() * higherLevel.length);
    return higherLevel[randomIndex];
  }
  // 70% gặp quái cùng cấp
  else if (sameLevel.length > 0 && rand < 0.8) {
    const randomIndex = Math.floor(Math.random() * sameLevel.length);
    return sameLevel[randomIndex];
  }
  // 20% gặp quái thấp hơn
  else if (lowerLevel.length > 0) {
    const randomIndex = Math.floor(Math.random() * lowerLevel.length);
    return lowerLevel[randomIndex];
  }
  // Fallback về quái cùng cấp nếu không có quái thấp hơn
  else if (sameLevel.length > 0) {
    const randomIndex = Math.floor(Math.random() * sameLevel.length);
    return sameLevel[randomIndex];
  }
  // Fallback cuối cùng về toàn bộ quái có thể gặp
  else {
    const randomIndex = Math.floor(Math.random() * availableMonsters.length);
    return availableMonsters[randomIndex];
  }
}

function calculateBattleResult(player, monster) {
  // Xác định cảnh giới của người chơi và quái
  const playerStageIndex = Math.floor(player.level / 3);
  const playerStageName = STAGES[playerStageIndex] || STAGES[STAGES.length - 1];
  
  const beastLevelOrder = ["Phàm Thú", "Yêu Thú", "Linh Thú", "Thánh Thú", "Yêu Vương", "Yêu Đế", "Thần Thú"];
  const stageTobeast = {
    "Phàm Nhân": "Phàm Thú",
    "Luyện Khí": "Phàm Thú", 
    "Trúc Cơ": "Yêu Thú",
    "Kim Đan": "Linh Thú",
    "Nguyên Anh": "Thánh Thú",
    "Hóa Thần": "Yêu Vương",
    "Anh Biến": "Yêu Đế",
    "Vấn Đỉnh": "Thần Thú"
  };
  
  const playerBeastLevel = stageTobeast[playerStageName] || "Phàm Thú";
  const playerBeastIndex = beastLevelOrder.indexOf(playerBeastLevel);
  const monsterBeastIndex = beastLevelOrder.indexOf(monster.beastLevel);
  
  const beastLevelDiff = monsterBeastIndex - playerBeastIndex;

  // Tính bonus từ chất lượng vũ khí
  let weaponBonus = 0;
  const weaponList = player.inventory.filter(item => item.type === "vũ khí" && canUseWeapon(player, item));
  if (weaponList.length > 0) {
    const bestWeapon = weaponList.reduce((best, weapon) => 
      (weapon.attack || 0) > (best.attack || 0) ? weapon : best
    );
    
    // Bonus theo cấp độ vũ khí
    const weaponGradeBonus = {
      "phàm khí": 0,
      "pháp khí": 0.1,      // +10% tỷ lệ thắng
      "linh khí": 0.2,      // +20% tỷ lệ thắng
      "linh bảo": 0.3,      // +30% tỷ lệ thắng
      "tiên khí": 0.4       // +40% tỷ lệ thắng
    };
    weaponBonus = weaponGradeBonus[bestWeapon.grade] || 0;
  }

  // Xử lý khi gặp quái thấp hơn 1+ cấp - chiến thắng áp đảo
  if (beastLevelDiff <= -1) {
    const turns = Math.floor(Math.random() * 3) + 1; // 1-3 lượt
    return { 
      result: "easy_win", 
      playerHpLeft: player.hp, // Không mất máu
      turns: turns,
      damageDealt: monster.hp,
      isEasy: true
    };
  }

  // Xử lý khi gặp quái cao hơn cảnh giới
  if (beastLevelDiff > 0) {
    // Tỉ lệ chạy trốn tăng theo độ chênh lệch cảnh giới
    let escapeChance = 0.4 + (beastLevelDiff * 0.15); // 40% + 15% mỗi cấp chênh lệch
    escapeChance = Math.min(escapeChance, 0.85); // Tối đa 85%
    
    if (Math.random() < escapeChance) {
      return { result: "escape" }; // Chạy trốn thành công
    }
    
    // Nếu không chạy trốn được, tỉ lệ thắng rất thấp + bonus vũ khí
    let winChance = 0.05 - (beastLevelDiff * 0.01) + weaponBonus; // 5% + bonus vũ khí
    winChance = Math.max(winChance, 0.01); // Tối thiểu 1%
    winChance = Math.min(winChance, 0.3); // Tối đa 30% với vũ khí tốt
    
    if (Math.random() < winChance) {
      // Thắng may mắn nhưng bị thương nặng
      const playerHpLeft = Math.max(1, Math.floor(player.hp * 0.1)); // Chỉ còn 10% máu
      return { 
        result: "lucky_win", 
        playerHpLeft: playerHpLeft,
        turns: Math.floor(Math.random() * 15) + 10,
        damageDealt: monster.hp,
        isLucky: true
      };
    }
    
    // Thua và bị thương nặng với tỉ lệ cao
    const severeInjuryChance = 0.7 + (beastLevelDiff * 0.1); // 70% + 10% mỗi cấp chênh
    const isSevereInjury = Math.random() < severeInjuryChance;
    
    // Tính damage nhận theo attack của quái
    const monsterAttack = monster.attack || 10;
    const damageReceived = Math.min(player.hp - 1, monsterAttack); // Không thể giết chết hoàn toàn
    const playerHpLeft = Math.max(1, player.hp - damageReceived);
    
    return { 
      result: "lose", 
      playerHpLeft: playerHpLeft,
      turns: Math.floor(Math.random() * 10) + 5,
      damageReceived: damageReceived,
      isSevereInjury: isSevereInjury
    };
  }

  // Chiến đấu bình thường khi cùng cấp hoặc thấp hơn
  const playerAttack = getPlayerAttack(player);
  const monsterHp = monster.hp;
  const monsterAttack = monster.attack || 10;
  
  // Tỷ lệ thắng 50/50 cho yêu thú cùng cấp + bonus từ vũ khí
  if (beastLevelDiff === 0) {
    let winChance = 0.5 + weaponBonus; // 50% + bonus vũ khí
    winChance = Math.min(winChance, 0.9); // Tối đa 90%
    const rand = Math.random();
    const turns = Math.floor(Math.random() * 10) + 5; // 5-15 lượt
    
    if (rand < winChance) {
      // Thắng
      const playerHpLeft = Math.max(Math.floor(player.hp * 0.3), Math.floor(player.hp * 0.8)); // Còn 30-80% máu
      return { 
        result: "win", 
        playerHpLeft: playerHpLeft,
        turns: turns,
        damageDealt: monsterHp
      };
    } else {
      // Thua - mất máu theo attack của quái
      const damageReceived = Math.min(player.hp - 1, Math.floor(monsterAttack * 0.8)); // 80% attack quái
      const playerHpLeft = Math.max(1, player.hp - damageReceived);
      return { 
        result: "lose", 
        playerHpLeft: playerHpLeft,
        turns: turns,
        damageReceived: damageReceived,
        isSevereInjury: false
      };
    }
  }
  
  // Chiến đấu với yêu thú thấp hơn cấp (tỷ lệ thắng cao hơn)
  if (beastLevelDiff < 0) {
    let winChance = 0.8 + weaponBonus; // 80% + bonus vũ khí
    winChance = Math.min(winChance, 0.95); // Tối đa 95%
    const rand = Math.random();
    const turns = Math.floor(Math.random() * 8) + 3; // 3-10 lượt
    
    if (rand < winChance) {
      // Thắng dễ dàng
      const playerHpLeft = Math.max(Math.floor(player.hp * 0.6), Math.floor(player.hp * 0.9)); // Còn 60-90% máu
      return { 
        result: "win", 
        playerHpLeft: playerHpLeft,
        turns: turns,
        damageDealt: monsterHp
      };
    } else {
      // Thua hiếm khi - mất máu theo attack của quái nhưng ít hơn
      const damageReceived = Math.min(player.hp - 1, Math.floor(monsterAttack * 0.6)); // 60% attack quái
      const playerHpLeft = Math.max(1, player.hp - damageReceived);
      return { 
        result: "lose", 
        playerHpLeft: playerHpLeft,
        turns: turns,
        damageReceived: damageReceived,
        isSevereInjury: false
      };
    }
  }
}

function logMonsterKill(player, monsterName) {
  player.monsterLog[monsterName] = (player.monsterLog[monsterName] || 0) + 1;
}

// Menu functions
function showMainMenu() {
  let text = `🗡️ ĐẠO GIỚI TU TIÊN:\n`;
  text += `1. ⚔️ Đánh quái\n`;
  text += `2. 🏪 Đan các\n`;
  text += `3. 📦 Kho đồ\n`;
  text += `4. ⚡ Độ kiếp\n`;
  text += `5. 🧘 Tu luyện\n`;
  text += `6. 🔥 Luyện khí\n`;
  text += `7. 👤 Thông tin nhân vật\n`;
  text += `\n💡 Reply số thứ tự để chọn`;
  text += `\n📖 Hướng dẫn chi tiết: .tu help`;
  return text;
}

function getGradeIcon(grade) {
  const gradeIcons = {
    "phàm khí": "🟫",
    "pháp khí": "🟦", 
    "linh khí": "🟪",
    "linh bảo": "🨨",
    "tiên khí": "🟥"
  };
  return gradeIcons[grade] || "⚪";
}

function getGradeName(index) {
  const grades = ["phàm khí", "pháp khí", "linh khí", "linh bảo", "tiên khí"];
  return grades[index - 1] || "phàm khí";
}

// Tu luyện bằng linh thạch
function cultivateWithSpiritStones(player, amount) {
  if (player.spiritStones < amount) {
    return { success: false, reason: "Không đủ linh thạch" };
  }
  
  // Kiểm tra trạng thái
  if (isDaoCoreInjured(player)) {
    return { success: false, reason: "Đạo cơ bị thương, không thể tu luyện" };
  }
  
  if (isPlayerInjured(player)) {
    return { success: false, reason: "Đang bị thương, không thể tu luyện" };
  }
  
  // Kiểm tra giới hạn exp - chỉ chặn khi ở Đỉnh Phong và full exp
  const expNeeded = getExpToLevel(player.level);
  const phaseIndex = player.level % 3;
  if (player.exp >= expNeeded && phaseIndex === 2 && isReadyForTribulation(player)) {
    return { success: false, reason: "Đã đạt Đỉnh Phong Viên Mãn, cần độ kiếp để tiếp tục" };
  }
  
  // Tính toán exp từ linh thạch
  // 1 linh thạch = 1 exp cơ bản, có hệ số linh căn
  const baseExp = amount;
  const spiritRootMultiplier = player.spiritRoot?.multiplier || 1.0;
  const finalExp = Math.floor(baseExp * spiritRootMultiplier);
  
  // Trừ linh thạch
  player.spiritStones -= amount;
  
  // Nhận exp
  const oldLevel = player.level;
  const actualExpGained = gainExp(player, finalExp);
  const levelUp = player.level > oldLevel;
  
  return {
    success: true,
    baseExp: baseExp,
    finalExp: finalExp,
    actualGained: actualExpGained,
    spiritRootBonus: spiritRootMultiplier > 1.0,
    levelUp: levelUp,
    newLevel: player.level
  };
}

// Luyện khí - nâng cấp vũ khí
function upgradeWeapon(player, weaponIndex, spiritStonesAmount) {
  const upgradeableWeapons = player.inventory.filter(item => item.type === "vũ khí" && canUseWeapon(player, item));
  
  if (weaponIndex < 0 || weaponIndex >= upgradeableWeapons.length) {
    return { success: false, reason: "Vũ khí không tồn tại" };
  }
  
  const weapon = upgradeableWeapons[weaponIndex];
  const weaponLevel = weapon.level || 0;
  
  if (weaponLevel >= 10) {
    return { success: false, reason: "Vũ khí đã đạt cấp tối đa (10)" };
  }
  
  // Tính chi phí nâng cấp theo cấp độ (tăng theo lũy thừa)
  const upgradeCosts = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200];
  const requiredCost = upgradeCosts[weaponLevel];
  
  if (spiritStonesAmount < requiredCost) {
    return { success: false, reason: `Cần ${requiredCost} linh thạch để nâng cấp lên level ${weaponLevel + 1}` };
  }
  
  if (player.spiritStones < spiritStonesAmount) {
    return { success: false, reason: "Không đủ linh thạch" };
  }
  
  // Tính tỷ lệ thành công (giảm theo level)
  const successRates = [80, 75, 70, 65, 60, 50, 40, 30, 20, 10]; // %
  const successRate = successRates[weaponLevel] / 100;
  
  const success = Math.random() < successRate;
  player.spiritStones -= spiritStonesAmount;
  
  if (success) {
    // Thành công - nâng cấp vũ khí
    const oldAttack = weapon.attack;
    weapon.level = weaponLevel + 1;
    weapon.attack = Math.floor(oldAttack * 1.15); // Tăng 15% sát thương mỗi level
    
    // Thay đổi tên vũ khí theo level
    const levelNames = ["", "+1", "+2", "+3", "+4", "+5", "+6", "+7", "+8", "+9", "+10"];
    const baseName = weapon.name.replace(/\s\+\d+$/, ""); // Xóa level cũ nếu có
    weapon.name = `${baseName} ${levelNames[weapon.level]}`;
    
    return {
      success: true,
      newLevel: weapon.level,
      oldAttack: oldAttack,
      newAttack: weapon.attack,
      weaponName: weapon.name
    };
  } else {
    // Thất bại - không mất vũ khí nhưng mất linh thạch
    return {
      success: false,
      reason: "Luyện khí thất bại",
      failed: true,
      lostSpiritStones: spiritStonesAmount
    };
  }
}

function getSpiritStoneCultivationCost(level) {
  // Chi phí tu luyện tăng theo cảnh giới (giảm 50% để cân bằng với giá vật liệu mới)
  const stageIndex = Math.floor(level / 4);
  const baseCost = [50, 150, 400, 1000, 2500, 6000, 15000][stageIndex] || 25000;
  return baseCost;
}

// Hệ thống luyện đan
function getAlchemyRecipes() {
  // Load materials để đảm bảo sử dụng chính xác tên vật liệu
  const materials = loadData(path.join(DATA_DIR, 'materials.json')) || [];
  
  // Lấy thông tin đan dược từ equipment.json
  const potionsFromEquipment = EQUIPMENT_LIST.filter(item => item.type === "đan dược");
  
  // Helper function để tìm vật liệu theo tên chính xác
  function findMaterial(name) {
    return materials.find(m => m.name === name);
  }
  
  // Tạo công thức luyện đan dựa trên dữ liệu có sẵn
  const recipes = [];
  let recipeId = 1;
  
  potionsFromEquipment.forEach(potion => {
    // Xác định vật liệu cần thiết dựa trên tên và cấp độ đan dược
    let materials = [];
    let spiritStones = Math.floor((potion.buyPrice || 50) * 0.5); // Chi phí = 50% giá mua
    let successRate = 100; // Luôn thành công
    let minLevel = potion.minLevel || 0;
    
    // Xác định vật liệu và chi phí dựa trên tên đan dược, sử dụng tên chính xác từ materials.json
    switch (potion.name) {
      case "Hồi Nguyên Đan":
        materials = [
          { name: "Máu Lang", type: "vật liệu", quantity: 1 },
          { name: "Lông Sói", type: "vật liệu", quantity: 1 }
        ];
        spiritStones = 5;
        break;
        
      case "Phục Thương Đan":
        materials = [
          { name: "Máu Ma Hầu", type: "vật liệu", quantity: 2 },
          { name: "Lông Kim Sí", type: "vật liệu", quantity: 1 }
        ];
        spiritStones = 10;
        break;
        
      case "Bồi Nguyên Đan":
        materials = [
          { name: "Vảy Thiết Giáp", type: "vật liệu", quantity: 2 },
          { name: "Tinh Túy Hỗn Độn", type: "vật liệu", quantity: 1 }
        ];
        spiritStones = 15;
        break;
        
      case "Thiên Tâm Đan":
        materials = [
          { name: "Long Cốt", type: "vật liệu", quantity: 1 },
          { name: "Lông Phượng Hoàng", type: "vật liệu", quantity: 1 }
        ];
        spiritStones = 50;
        break;
        
      case "Ngũ Hành Thiên Đan":
        materials = [
          { name: "Tinh Hồn Cửu Vĩ", type: "vật liệu", quantity: 2 },
          { name: "Ma Khí Tinh Túy", type: "vật liệu", quantity: 2 },
          { name: "Địa Ngục Hỏa Chủng", type: "vật liệu", quantity: 1 }
        ];
        spiritStones = 100;
        break;
        
      case "Cửu Chuyển Hoàn Hồn Đan":
        materials = [
          { name: "Thái Cổ Thần Tủy", type: "vật liệu", quantity: 1 },
          { name: "Hỗn Độn Thần Tinh", type: "vật liệu", quantity: 1 },
          { name: "Vô Thượng Thần Hoa", type: "vật liệu", quantity: 1 }
        ];
        spiritStones = 200;
        break;
        
      case "Trường Sinh Bất Lão Đan":
        materials = [
          { name: "Tối Cao Thần Nguyên", type: "vật liệu", quantity: 1 },
          { name: "Vô Thượng Thần Hoa", type: "vật liệu", quantity: 2 },
          { name: "Thái Cổ Thần Tủy", type: "vật liệu", quantity: 1 }
        ];
        spiritStones = 300;
        break;
        
      case "Linh Khí Đan":
        materials = [
          { name: "Tinh Túy Hỗn Độn", type: "vật liệu", quantity: 1 },
          { name: "Vảy Thiết Giáp", type: "vật liệu", quantity: 1 }
        ];
        spiritStones = 3;
        break;
        
      case "Huyền Linh Đan":
        materials = [
          { name: "Ma Khí Tinh Túy", type: "vật liệu", quantity: 1 },
          { name: "Lông Kim Sí", type: "vật liệu", quantity: 2 }
        ];
        spiritStones = 20;
        break;
        
      default:
        // Công thức mặc định cho đan dược không xác định
        materials = [
          { name: "Máu Lang", type: "vật liệu", quantity: 1 },
          { name: "Lông Sói", type: "vật liệu", quantity: 1 }
        ];
        spiritStones = Math.max(20, Math.floor(spiritStones));
    }
    
    // Kiểm tra tất cả vật liệu có tồn tại trong materials.json
    const validMaterials = materials.filter(mat => {
      const foundMaterial = findMaterial(mat.name);
      if (!foundMaterial) {
        console.warn(`Cảnh báo: Vật liệu "${mat.name}" không tồn tại trong materials.json`);
        return false;
      }
      return true;
    });
    
    // Chỉ tạo công thức nếu tất cả vật liệu hợp lệ
    if (validMaterials.length === materials.length) {
      // Tạo công thức luyện đan
      const recipe = {
        id: recipeId++,
        name: potion.name,
        type: potion.type,
        subType: potion.subType,
        grade: potion.grade,
        rarity: potion.rarity,
        description: potion.description,
        materials: validMaterials,
        spiritStones: spiritStones,
        successRate: successRate,
        minLevel: minLevel
      };
      
      // Copy các thuộc tính đặc biệt từ đan dược gốc
      if (potion.healAmount) recipe.healAmount = potion.healAmount;
      if (potion.spiritPowerAmount) recipe.spiritPowerAmount = potion.spiritPowerAmount;
      if (potion.healTime !== undefined) recipe.healTime = potion.healTime;
      if (potion.healDaoCore) recipe.healDaoCore = potion.healDaoCore;
      
      recipes.push(recipe);
    }
  });
  
  // Sắp xếp theo minLevel và độ hiếm
  return recipes.sort((a, b) => {
    if (a.minLevel !== b.minLevel) return a.minLevel - b.minLevel;
    const gradeOrder = { "phàm khí": 1, "pháp khí": 2, "linh khí": 3, "linh bảo": 4, "tiên khí": 5 };
    return (gradeOrder[a.grade] || 1) - (gradeOrder[b.grade] || 1);
  });
}

function getPlayerMaterials(player) {
  return player.inventory.filter(item => item.type === "vật liệu");
}

function canCraftPotion(player, recipe) {
  // Kiểm tra level
  if (player.level < recipe.minLevel) {
    return { canCraft: false, reason: `Cần đạt level ${recipe.minLevel}` };
  }
  
  // Kiểm tra linh thạch
  if (player.spiritStones < recipe.spiritStones) {
    return { canCraft: false, reason: `Cần ${recipe.spiritStones} linh thạch` };
  }
  
  // Kiểm tra vật liệu
  const playerMaterials = getPlayerMaterials(player);
  for (const material of recipe.materials) {
    let totalCount = 0;
    playerMaterials.forEach(item => {
      if (item.name === material.name) {
        totalCount += (item.quantity || 1);
      }
    });
    
    if (totalCount < material.quantity) {
      return { 
        canCraft: false, 
        reason: `Thiếu ${material.quantity - totalCount} ${material.name}` 
      };
    }
  }
  
  return { canCraft: true };
}

function craftPotion(player, recipe) {
  const canCraft = canCraftPotion(player, recipe);
  if (!canCraft.canCraft) {
    return { success: false, reason: canCraft.reason };
  }
  
  // Trừ linh thạch
  player.spiritStones -= recipe.spiritStones;
  
  // Trừ vật liệu
  for (const material of recipe.materials) {
    let needToRemove = material.quantity;
    
    for (let i = player.inventory.length - 1; i >= 0 && needToRemove > 0; i--) {
      const item = player.inventory[i];
      if (item.name === material.name && item.type === "vật liệu") {
        const itemQuantity = item.quantity || 1;
        
        if (itemQuantity > needToRemove) {
          // Nếu quantity của item lớn hơn số lượng cần trừ, chỉ trừ quantity
          item.quantity = itemQuantity - needToRemove;
          needToRemove = 0;
        } else if (itemQuantity === needToRemove) {
          // Nếu bằng nhau, xóa item
          player.inventory.splice(i, 1);
          needToRemove = 0;
        } else {
          // Nếu quantity item nhỏ hơn, xóa item và tiếp tục tìm
          player.inventory.splice(i, 1);
          needToRemove -= itemQuantity;
        }
      }
    }
    // Debug: Kiểm tra xem có trừ đủ vật liệu không
    if (needToRemove > 0) {
      console.error(`Lỗi: Không thể trừ đủ ${material.name}, còn thiếu ${needToRemove}`);
    }
  }
  
  // Tỷ lệ thành công 85%
  const success = Math.random() < 0.85;
  
  if (success) {
    // Thành công - thêm đan dược vào kho
    const potion = {
      name: recipe.name,
      type: recipe.type,
      subType: recipe.subType,
      grade: recipe.grade,
      rarity: recipe.rarity,
      description: recipe.description,
      sellPrice: Math.floor(recipe.spiritStones * 0.7),
      buyPrice: recipe.spiritStones * 3,
      obtainedAt: new Date().toISOString()
    };
    
    // Copy các thuộc tính đặc biệt
    if (recipe.healAmount) potion.healAmount = recipe.healAmount;
    if (recipe.spiritPowerAmount) potion.spiritPowerAmount = recipe.spiritPowerAmount;
    if (recipe.healTime !== undefined) potion.healTime = recipe.healTime;
    if (recipe.healDaoCore) potion.healDaoCore = recipe.healDaoCore;
    
    addEquipment(player, potion);
    
    return {
      success: true,
      potionName: recipe.name,
      grade: recipe.grade
    };
  } else {
    // Thất bại - mất nguyên liệu và linh thạch
    return {
      success: false,
      reason: "Luyện đan thất bại",
      failed: true
    };
  }
}

function getPlayerStats(player) {
  try {
    console.log("[DEBUG] Starting getPlayerStats function");
    console.log("[DEBUG] Player data:", player.name, player.level);
    
    const totalKills = Object.values(player.monsterLog || {}).reduce((sum, count) => sum + count, 0);
    const favoriteMonster = Object.entries(player.monsterLog || {})
      .sort(([,a], [,b]) => b - a)[0];

    // Thống kê vật phẩm theo loại
    const itemStats = {};
    (player.inventory || []).forEach(item => {
      itemStats[item.type] = (itemStats[item.type] || 0) + 1;
    });

    // Tính tổng giá trị kho đồ
    const totalValue = (player.inventory || []).reduce((sum, item) => sum + (item.sellPrice || 0), 0);

    let stats = `📊 THỐNG KÊ CHI TIẾT - ${player.name || 'Không tên'}:\n\n`;
    stats += `🎭 Loại nhân vật: ${player.weaponType ? player.weaponType.charAt(0).toUpperCase() + player.weaponType.slice(1) + " Khách" : "Chưa xác định"}\n`;
    
    // Hiển thị linh căn
    if (player.spiritRoot) {
      const spiritIcon = getSpiritRootIcon(player.spiritRoot.grade);
      stats += `${spiritIcon} Linh căn: ${player.spiritRoot.grade} (x${player.spiritRoot.multiplier})\n`;
      stats += `   📋 ${player.spiritRoot.description}\n`;
    }
    
    stats += `🏆 Cảnh giới: ${getDisplayLevelName(player)}\n`;
    stats += `⚡ Kinh nghiệm: ${player.exp || 0}/${getExpToLevel(player.level || 0)}\n`;
    stats += `📈 Tiến độ cảnh giới: ${Math.floor((player.exp || 0)/getExpToLevel(player.level || 0)*100)}%\n`;
    stats += `❤️ Máu: ${player.hp || 0}/${player.maxHp || 0}\n`;
    stats += `💫 Linh lực: ${player.spiritPower || 0}/${player.maxSpiritPower || 0}\n`;
    stats += `🗡️ Sát thương: ${getPlayerAttack(player)}\n`;
    stats += `💎 Linh thạch: ${(player.spiritStones || 0).toLocaleString()}\n`;
    stats += `💰 Tổng giá trị kho đồ: ${totalValue.toLocaleString()} linh thạch\n`;
    
    // Hiển thị trạng thái độ kiếp
    if (isReadyForTribulation(player)) {
      stats += `⚡ Trạng thái: Sẵn sàng độ kiếp!\n`;
    }
    stats += `\n`;

    stats += `🎒 KHO ĐỒ (${(player.inventory || []).length} món):\n`;
    Object.entries(itemStats).forEach(([type, count]) => {
      const typeIcon = type === "đan dược" ? "💊" : 
                      type === "yêu đan" ? "🔮" : 
                      type === "vật liệu" ? "🧰" : 
                      type === "ngọc" ? "💎" :
                      type === "tinh túy" ? "✨" :
                      type === "linh hồn" ? "👻" : "📦";
      stats += `  ${typeIcon} ${type}: ${count}\n`;
    });

    stats += `\n⚔️ CHIẾN ĐẤU:\n`;
    stats += `🎯 Tổng quái đã tiêu diệt: ${totalKills}\n`;
    if (favoriteMonster) {
      stats += `🏅 Quái đánh nhiều nhất: ${favoriteMonster[0]} (${favoriteMonster[1]} lần)\n`;
    }

    // Hiển thị trạng thái buff
    if (hasExpBoost(player)) {
      const boostTimeLeft = Math.ceil((new Date(player.expBoostUntil) - new Date()) / 60000);
      stats += `⚡ Buff kinh nghiệm: x${player.expBoostMultiplier} (${boostTimeLeft} phút)\n`;
    }
    if (hasInjuryImmunity(player)) {
      const immunityTimeLeft = Math.ceil((new Date(player.immunityUntil) - new Date()) / 60000);
      stats += `🛡️ Miễn nhiễm bị thương: ${immunityTimeLeft} phút\n`;
    }
    if (isDaoCoreInjured(player)) {
      const daoCoreTimeLeft = getDaoCoreInjuryTimeLeft(player);
      stats += `💀 Đạo cơ: Bị thương (${daoCoreTimeLeft} phút)\n`;
    } else if (isPlayerInjured(player)) {
      const injuryTimeLeft = getInjuryTimeLeft(player);
      stats += `🩸 Trạng thái: Bị thương (${injuryTimeLeft} phút)\n`;
    } else {
      stats += `💪 Trạng thái: Khỏe mạnh\n`;
    }

    stats += `\n🕐 Cập nhật: ${formatTime(new Date())}`;
    
    console.log("[DEBUG] getPlayerStats completed successfully");
    return stats;
  } catch (error) {
    console.error("[ERROR] getPlayerStats function failed:", error);
    return `❌ Lỗi khi lấy thông tin nhân vật: ${error.message}`;
  }
}



// Lệnh chính `.tu`
module.exports.config = {
  name: "tu",
  version: "2.0.0",
  hasPermission: 0,
  credits: "Atomic",
  description: "Tu tiên - đánh quái, nhận exp, trang bị và linh thạch (phiên bản nâng cao)",
  commandCategory: "Tu tiên",
  usages: "[lệnh]",
  cooldowns: 5
};

function getMonsterDisplayName(monster) {
    const beastLevelIcon = getBeastLevelIcon(monster.beastLevel);
    return `${beastLevelIcon} ${monster.name} 【${monster.phase} ${monster.beastLevel}】`;
}

function getBeastLevelIcon(beastLevel) {
  const icons = {
    "Phàm Thú": "🐺",
    "Yêu Thú": "🦊", 
    "Linh Thú": "🐲",
    "Thánh Thú": "🦄",
    "Yêu Vương": "👑",
    "Yêu Đế": "👹",
    "Thần Thú": "🔥"
  };
  return icons[beastLevel] || "🐾";
}

function getRarityIcon(rarity) {
  const icons = {
    "thường": "⚪",
    "hiếm": "🟢",
    "cực hiếm": "🔵", 
    "thần thoại": "🟣",
    "huyền thoại": "🟡",
    "tuyệt thế": "🔴"
  };
  return icons[rarity] || "⚪";
}

module.exports.run = async ({ event, api, args }) => {
  const userID = event.senderID;
  const player = loadPlayer(userID);

  // Kiểm tra nếu người chơi chưa tạo nhân vật
  if (!player) {
    const weaponTypes = getWeaponTypes();
    let createCharText = `🎭 TẠO NHÂN VẬT MỚI\n\n`;
    createCharText += `Chào mừng đến với thế giới tu tiên!\n`;
    createCharText += `Hãy chọn loại vũ khí chuyên biệt cho nhân vật:\n\n`;
    
    weaponTypes.forEach(type => {
      createCharText += `${type.id}. ${type.name}\n`;
      createCharText += `   🗡️ ${type.description}\n\n`;
    });
    
    createCharText += `💰 Phần thưởng tân thủ: 5000 linh thạch\n`;
    createCharText += `💡 Reply số thứ tự để chọn loại vũ khí`;
    
    return api.sendMessage(createCharText, event.threadID, (error, info) => {
      if (!error) {
        global.client.handleReply.push({
          name: this.config.name,
          messageID: info.messageID,
          author: userID,
          type: "create_character"
        });
      }
    });
  }

  if (!player) {
    return api.sendMessage("❌ Lỗi: Không thể tải dữ liệu người chơi!", event.threadID, event.messageID);
  }

  const choice = (args[0] || '').toLowerCase();

  if (!choice) {
    const menuMessage = showMainMenu();
    return api.sendMessage(menuMessage, event.threadID, (error, info) => {
      if (!error) {
        global.client.handleReply.push({
          name: this.config.name,
          messageID: info.messageID,
          author: userID,
          type: "main_menu"
        });
      }
    });
  }

  // Hiển thị hướng dẫn sử dụng
  if (choice === 'help' || choice === 'huongdan') {
    let helpText = `🎮 HƯỚNG DẪN TU TIÊN:\n\n`;
    helpText += `📖 CÁC LỆNH CƠ BẢN:\n`;
    helpText += `.tu - Mở menu chính\n`;
    helpText += `.tu 1 - Đánh quái\n`;
    helpText += `.tu 2 - Cửa hàng\n`;
    helpText += `.tu 5 - Kho đồ\n`;
    helpText += `.tu 6 - Thống kê\n`;
    helpText += `.tu 9 - Độ kiếp\n\n`;
    helpText += `💊 SỬ DỤNG ĐAN DƯỢC:\n`;
    helpText += `.tu use [số] - Dùng 1 đan dược\n`;
    helpText += `.tu use [số1] [số2] [số3] - Dùng nhiều đan dược cùng lúc\n`;
    helpText += `Ví dụ: .tu use 1 2 3 (dùng đan dược số 1, 2, 3)\n\n`;
    helpText += `🛒 MUA ĐAN DƯỢC:\n`;
    helpText += `.tu shop 2 [số] [số lượng] - Mua đan dược\n`;
    helpText += `Ví dụ: .tu shop 2 1 5 (mua 5 viên đan dược số 1)\n\n`;
    helpText += `💡 Mẹo: Sử dụng nhiều đan dược cùng lúc sẽ tối ưu hiệu quả!`;
    return api.sendMessage(helpText, event.threadID, event.messageID);
  }

  

  // Đánh quái
  if (choice === '1' || choice === 'đánh' || choice === 'đánh quái' || choice === 'quái') {
    // Kiểm tra có vũ khí phù hợp không
    if (!hasUsableWeapon(player)) {
      const weaponTypeName = {
        "kiếm": "kiếm",
        "đao": "đao", 
        "thương": "thương",
        "cung": "cung tên"
      };
      const requiredWeapon = weaponTypeName[player.weaponType] || "vũ khí";
      return api.sendMessage(`⚔️ Bạn cần có ${requiredWeapon} để có thể đánh quái!\n💰 Hãy mua ${requiredWeapon} ở cửa hàng trước khi săn quái.\n💎 Linh thạch hiện có: ${player.spiritStones}`, event.threadID, event.messageID);
    }

    // Kiểm tra trạng thái đạo cơ bị thương
    if (isDaoCoreInjured(player)) {
      const timeLeft = getDaoCoreInjuryTimeLeft(player);
      const recoveryTime = formatTime(new Date(player.daoCoreInjuredUntil));
      return api.sendMessage(`💀 Đạo cơ đang bị hao tổn! Không thể tu luyện.\n⏰ Thời gian hồi phục: ${recoveryTime}\n💊 Hoặc dùng đan dược chữa đạo cơ (Thiên Tâm Đan, Ngũ Hành Thiên Đan, Cửu Chuyển Hoàn Hồn Đan)`, event.threadID, event.messageID);
    }

    // Kiểm tra trạng thái bị thương
    if (isPlayerInjured(player)) {
      const timeLeft = getInjuryTimeLeft(player);
      const recoveryTime = formatTime(new Date(player.injuredUntil));
      return api.sendMessage(`🩸 Bạn đang bị thương! Cần chờ ${timeLeft} phút nữa để hồi phục hoặc dùng đan dược trị thương.\n⏰ Thời gian hồi phục: ${recoveryTime}`, event.threadID, event.messageID);
    }

    // Kiểm tra máu
    if (player.hp <= 0) {
      return api.sendMessage(`💀 Bạn đã hết máu! Cần sử dụng đan dược để hồi phục máu trước khi tiếp tục săn quái.`, event.threadID, event.messageID);
    }

    // Kiểm tra máu dưới 20% - không cho phép đi săn quái
    const minHpPercent = 0.2; // 20%
    const minHpRequired = Math.floor(player.maxHp * minHpPercent);
    if (player.hp < minHpRequired) {
      const hpPercent = Math.floor((player.hp / player.maxHp) * 100);
      return api.sendMessage(`🩸 Máu quá thấp để săn quái! (${hpPercent}%)\n❤️ Máu hiện tại: ${player.hp}/${player.maxHp}\n💊 Cần hồi phục máu lên ít nhất ${minHpRequired} (20%) để có thể tiếp tục săn quái.\n💡 Sử dụng đan dược để hồi phục máu trước khi đi săn quái.`, event.threadID, event.messageID);
    }

    // Kiểm tra linh lực
    if (!canHunt(player)) {
      const recoveryTime = player.spiritPowerRecoveryTime ? formatTime(new Date(player.spiritPowerRecoveryTime)) : "Đang tính toán...";
      return api.sendMessage(`🌀 Linh lực đã kiệt! Cần chờ để hồi phục linh lực.\n💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n⏰ Hồi phục vào: ${recoveryTime}\n💡 Mỗi 1 phút sẽ hồi ${GAME_CONFIG?.combat?.spiritPowerRecoveryAmount || 10} linh lực (10 phút hồi đầy)`, event.threadID, event.messageID);
    }

    // Tiêu hao linh lực
    consumeSpiritPower(player);

    // Random quái theo cấp độ người chơi
    const monster = getRandomMonster(player.level);
    const battleResult = calculateBattleResult(player, monster);

    if (battleResult.result === "win" || battleResult.result === "lucky_win" || battleResult.result === "easy_win") {
      // Thắng (bình thường, may mắn hoặc dễ dàng)
      player.hp = battleResult.playerHpLeft;
      const finalExp = gainExpWithBoost(player, monster.exp);
      logMonsterKill(player, monster.name);

      let msg = `⚔️ CHIẾN THẮNG${battleResult.isLucky ? ' MAY MẮN' : battleResult.isEasy ? ' ÁP ĐẢO' : ''}!\n`;
      msg += `${getMonsterDisplayName(monster)} đã bị tiêu diệt!\n`;
      msg += `🗡️ Chiến đấu ${battleResult.turns} lượt\n`;
      msg += `💥 Sát thương gây ra: ${battleResult.damageDealt}\n`;
      
      if (battleResult.isLucky) {
        msg += `🍀 Thắng một cách kỳ diệu trước đối thủ mạnh hơn!\n`;
        msg += `⚠️ Bạn đã bị thương nặng trong trận chiến!\n`;
      } else if (battleResult.isEasy) {
        msg += `💪 Áp đảo hoàn toàn! Yêu thú quá yếu so với sức mạnh hiện tại!\n`;
        msg += `🛡️ Không hề bị thương trong trận chiến!\n`;
      }
      
      if (finalExp.gained > 0) {
        msg += `📈 Nhận được ${finalExp.gained} kinh nghiệm`;
        if (hasExpBoost(player)) {
          msg += ` (x${player.expBoostMultiplier} buff)`;
        }
        if (finalExp.spiritRootBonus) {
          msg += ` (Bonus linh căn x${player.spiritRoot.multiplier})`;
        }
        msg += `\n`;
      } else {
        // Kiểm tra nếu có thể độ kiếp
        if (isReadyForTribulation(player)) {
          msg += `⚡ Đã đạt Viên Mãn - Không thể nhận thêm kinh nghiệm!\n`;
          msg += `💡 Hãy độ kiếp để lên cảnh giới mới!\n`;
        } else {
          msg += `⚡ Đã đạt Viên Mãn cảnh giới ${getCurrentStage(player.level)}!\n`;
          msg += `💡 Tiếp tục tu luyện để nâng cao sức mạnh!\n`;
        }
      }
      
      // Kiểm tra nếu có thể độ kiếp
      if (isReadyForTribulation(player)) {
        msg += `⚡ Đã sẵn sàng độ kiếp! Dùng lệnh .tu 9\n`;
      }
      msg += `\n`;

      const drop = dropEquipment(monster);
      if (drop) {
        addEquipment(player, drop);
        const gradeIcon = getGradeIcon(drop.grade);
        const rarityIcon = getRarityIcon(drop.rarity);

        msg += `🎁 PHẦN THƯỞNG: ${gradeIcon}${rarityIcon} ${drop.name}\n`;
        if (player.settings?.autoSell) {
          msg += `   💰 Tự động bán: +${drop.sellPrice} linh thạch\n`;
        } else {
          msg += `   💎 Giá trị: ${drop.sellPrice} linh thạch\n`;
        }
        msg += `   🧰 Vật liệu luyện đan\n`;
      } else {
        msg += `💨 Không có chiến lợi phẩm...\n`;
      }

      msg += `\n📊 TRẠNG THÁI:\n`;
      msg += `🏆 Cảnh giới: ${getDisplayLevelName(player)}\n`;
      msg += `⚡ Kinh nghiệm: ${player.exp}/${getExpToLevel(player.level)}\n`;
      msg += `❤️ Máu: ${player.hp}/${player.maxHp}\n`;
      msg += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
      msg += `💎 Linh thạch: ${player.spiritStones.toLocaleString()}\n`;

      // Hiển thị trạng thái buff
      if (hasExpBoost(player)) {
        const boostTimeLeft = Math.ceil((new Date(player.expBoostUntil) - new Date()) / 60000);
        msg += `⚡ Buff kinh nghiệm: x${player.expBoostMultiplier} (${boostTimeLeft}p)\n`;
      }
      if (hasInjuryImmunity(player)) {
        const immunityTimeLeft = Math.ceil((new Date(player.immunityUntil) - new Date()) / 60000);
        msg += `🛡️ Miễn nhiễm: ${immunityTimeLeft}p\n`;
      }

      msg += `\n🕐 ${formatTime(new Date())}`;
      savePlayer(userID, player);
      return api.sendMessage(msg, event.threadID, event.messageID);
    } else if (battleResult.result === "escape") {
      // Chạy trốn thành công nhưng bị hậu quả
      
      // Cạn kiệt linh khí (chỉ còn 10% hoặc tối thiểu 1 điểm)
      player.spiritPower = Math.max(1, Math.floor(player.spiritPower * 0.1));
      
      // Bị thương nhẹ (mất 30% máu)
      const healthLoss = Math.floor(player.maxHp * 0.3);
      player.hp = Math.max(1, player.hp - healthLoss);
      
      // Bị thương nhẹ trong 5 phút (nếu không có miễn nhiễm)
      if (!hasInjuryImmunity(player)) {
        const injuredTime = new Date();
        injuredTime.setMinutes(injuredTime.getMinutes() + 5); // 5 phút bị thương nhẹ
        player.injuredUntil = injuredTime.toISOString();
      }
      
      let msg = `💨 CHẠY TRỐN THÀNH CÔNG!\n`;
      msg += `Bạn đã kịp thời thoát khỏi ${getMonsterDisplayName(monster)}!\n`;
      msg += `🏃‍♂️ May mắn thoát được một tai họa lớn!\n\n`;
      msg += `⚠️ HẬU QUẢ CỦA VIỆC CHẠY TRỐN:\n`;
      msg += `💔 Mất ${healthLoss} máu do hoảng loạn\n`;
      msg += `💫 Linh khí cạn kiệt do sử dụng thần thức chạy trốn\n`;
      
      if (!hasInjuryImmunity(player)) {
        const recoveryTime = formatTime(new Date(player.injuredUntil));
        msg += `🩸 Bị thương nhẹ (5 phút): ${recoveryTime}\n`;
      } else {
        msg += `🛡️ Miễn nhiễm bị thương vẫn còn hiệu lực\n`;
      }
      
      msg += `\n📊 TRẠNG THÁI:\n`;
      msg += `❤️ Máu: ${player.hp}/${player.maxHp}\n`;
      msg += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
      msg += `💡 Mẹo: Hãy nâng cao cảnh giới trước khi thách thức yêu thú mạnh hơn!\n`;
      msg += `🕐 ${formatTime(new Date())}`;
      savePlayer(userID, player);
      return api.sendMessage(msg, event.threadID, event.messageID);
    } else {
      // Thua - mất máu và bị thương
      player.hp = battleResult.playerHpLeft; // Luôn là 1 máu
      
      if (hasInjuryImmunity(player)) {
        let msg = `⚔️ Bạn đã bị ${getMonsterDisplayName(monster)} đánh bại!\n`;
        msg += `🗡️ Chiến đấu ${battleResult.turns} lượt\n`;
        msg += `💔 Mất ${battleResult.damageReceived} máu\n`;
        msg += `❤️ Máu còn lại: ${player.hp}/${player.maxHp}\n`;
        msg += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
        msg += `🛡️ Hiệu ứng miễn nhiễm vẫn còn hiệu lực - không bị thương.\n`;
        msg += `🕐 Thời gian: ${formatTime(new Date())}`;
        savePlayer(userID, player);
        return api.sendMessage(msg, event.threadID, event.messageID);
      } else {
        // Luôn bị thương 10 phút khi thua
        injurePlayer(player);
        
        // Xử lý thương tích nặng cho yêu thú cao hơn cấp
        if (battleResult.isSevereInjury) {
          // Bị thương nặng - thời gian hồi phục gấp đôi (20 phút)
          const currentInjuryTime = new Date(player.injuredUntil);
          currentInjuryTime.setMinutes(currentInjuryTime.getMinutes() + 10); // Thêm 10 phút nữa = 20 phút tổng
          player.injuredUntil = currentInjuryTime.toISOString();
        }
        
        const recoveryTime = formatTime(new Date(player.injuredUntil));
        let msg = `💀 THẤT BẠI!\n`;
        msg += `${getMonsterDisplayName(monster)} đã đánh bại bạn!\n`;
        msg += `🗡️ Chiến đấu ${battleResult.turns} lượt\n`;
        msg += `💔 Mất ${battleResult.damageReceived} máu\n\n`;
        
        if (battleResult.isSevereInjury) {
          msg += `💥 BỊ THƯƠNG CỰC NẶNG:\n`;
          msg += `⚠️ Thách thức yêu thú vượt quá sức mạnh!\n`;
          msg += `🩸 Thời gian hồi phục kéo dài (20 phút)\n`;
        } else {
          msg += `🩸 BỊ THƯƠNG NẶNG:\n`;
          msg += `⚠️ Cần 10 phút để hồi phục hoàn toàn\n`;
        }
        
        msg += `❤️ Máu: ${player.hp}/${player.maxHp}\n`;
        msg += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
        msg += `⏰ Thời gian hồi phục: ${recoveryTime}\n`;
        msg += `💊 Hoặc sử dụng đan dược để trị thương ngay\n\n`;
        msg += `💡 Mẹo: Nâng cao cảnh giới trước khi thách thức yêu thú mạnh hơn!\n`;
        msg += `🕐 ${formatTime(new Date())}`;
        
        savePlayer(userID, player);
        return api.sendMessage(msg, event.threadID, event.messageID);
      }
    }
  }

  // Đan các
  if (choice === '2' || choice === 'đan các' || choice === 'shop') {
    let text = `🏪 ĐAN CÁC:\n\n`;
    text += `1. 🌿 Linh thảo\n`;
    text += `2. 🧪 Luyện đan\n\n`;
    text += `💡 Reply số thứ tự để chọn`;
    return api.sendMessage(text, event.threadID, (error, info) => {
      if (!error) {
        global.client.handleReply.push({
          name: this.config.name,
          messageID: info.messageID,
          author: userID,
          type: "alchemy_main"
        });
      }
    });
  }

  

  // Sử dụng nhiều đan dược cùng lúc
  if (choice === 'use' && args[1]) {
    const potionIndices = args.slice(1).map(arg => parseInt(arg) - 1);
    const potions = player.inventory.filter(item => item.type === "đan dược");
    
    if (potions.length === 0) {
      return api.sendMessage("💊 Bạn không có đan dược nào để sử dụng!", event.threadID, event.messageID);
    }

    // Gộp đan dược theo tên
    const groupedPotions = {};
    potions.forEach((potion, index) => {
      const key = `${potion.name}_${potion.grade}`;
      if (!groupedPotions[key]) {
        groupedPotions[key] = { potion, count: 0, indices: [] };
      }
      groupedPotions[key].count++;
      groupedPotions[key].indices.push(index);
    });

    const sortedPotions = Object.values(groupedPotions);
    const validIndices = potionIndices.filter(index => index >= 0 && index < sortedPotions.length);
    
    if (validIndices.length === 0) {
      return api.sendMessage("❌ Không có đan dược hợp lệ để sử dụng!", event.threadID, event.messageID);
    }

    let usedPotions = [];
    let totalEffects = {
      healAmount: 0,
      spiritPowerAmount: 0,
      hasExpBoost: false,
      hasImmunity: false,
      hasDaoCoreHeal: false,
      hasInjuryHeal: false
    };

    // Sử dụng từng đan dược
    for (const index of validIndices) {
      const potionGroup = sortedPotions[index];
      const inventoryIndex = player.inventory.findIndex(item => 
        item.name === potionGroup.potion.name && item.type === "đan dược"
      );
      
      if (inventoryIndex !== -1) {
        const potion = player.inventory[inventoryIndex];
        player.inventory.splice(inventoryIndex, 1);
        
        // Tính tổng hiệu ứng
        if (potion.healAmount) {
          if (potion.healAmount === 9999) {
            totalEffects.healAmount = 9999;
          } else {
            totalEffects.healAmount += potion.healAmount;
          }
        }
        
        if (potion.spiritPowerAmount) {
          if (potion.spiritPowerAmount === 9999) {
            totalEffects.spiritPowerAmount = 9999;
          } else {
            totalEffects.spiritPowerAmount += potion.spiritPowerAmount;
          }
        }
        
        if (potion.subType === "chữa đạo cơ" || potion.healDaoCore) {
          totalEffects.hasDaoCoreHeal = true;
        }
        
        if (potion.subType === "chữa thương") {
          totalEffects.hasInjuryHeal = true;
        }
        
        if (potion.grade === "linh khí" || potion.grade === "linh bảo" || potion.grade === "tiên khí") {
          totalEffects.hasExpBoost = true;
        }
        
        if (potion.grade === "linh bảo" || potion.grade === "tiên khí") {
          totalEffects.hasImmunity = true;
        }
        
        usedPotions.push(potion.name);
      }
    }

    // Áp dụng hiệu ứng tổng hợp
    if (totalEffects.healAmount > 0) {
      if (totalEffects.healAmount === 9999) {
        player.hp = player.maxHp;
      } else {
        player.hp = Math.min(player.maxHp, player.hp + totalEffects.healAmount);
      }
    }

    if (totalEffects.spiritPowerAmount > 0) {
      if (totalEffects.spiritPowerAmount === 9999) {
        player.spiritPower = player.maxSpiritPower;
      } else {
        player.spiritPower = Math.min(player.maxSpiritPower, player.spiritPower + totalEffects.spiritPowerAmount);
      }
    }

    if (totalEffects.hasDaoCoreHeal) {
      healDaoCore(player);
    }

    if (totalEffects.hasInjuryHeal) {
      healPlayer(player);
    }

    if (totalEffects.hasExpBoost) {
      const now = new Date();
      const expBoostTime = new Date(now);
      expBoostTime.setMinutes(expBoostTime.getMinutes() + 30);
      player.expBoostUntil = expBoostTime.toISOString();
      player.expBoostMultiplier = 1.5;
    }

    if (totalEffects.hasImmunity) {
      const now = new Date();
      const immunityTime = new Date(now);
      immunityTime.setHours(immunityTime.getHours() + 1);
      player.immunityUntil = immunityTime.toISOString();
    }

    savePlayer(userID, player);

    let msg = `✅ Đã sử dụng ${usedPotions.length} đan dược:\n`;
    msg += `💊 ${usedPotions.join(', ')}\n\n`;
    msg += `📊 HIỆU QUẢ:\n`;
    msg += `❤️ Máu: ${player.hp}/${player.maxHp}\n`;
    msg += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
    
    if (totalEffects.hasExpBoost) {
      msg += `⚡ Buff kinh nghiệm: x1.5 (30 phút)\n`;
    }
    if (totalEffects.hasImmunity) {
      msg += `🛡️ Miễn nhiễm bị thương (1 giờ)\n`;
    }
    if (totalEffects.hasDaoCoreHeal) {
      msg += `🩹 Đã chữa lành đạo cơ\n`;
    }
    if (totalEffects.hasInjuryHeal) {
      msg += `🩹 Đã chữa lành thương tích\n`;
    }
    
    return api.sendMessage(msg, event.threadID, event.messageID);
  }

  

  // Kho đồ
  if (choice === '3' || choice === 'kho' || choice === 'kho đồ' || choice === 'inventory') {
    if (!player.inventory.length)
      return api.sendMessage("📦 Kho đồ trống! Hãy đánh quái để thu thập trang bị!", event.threadID, event.messageID);

    let inventoryText = "📦 KHO ĐỒ:\n\n";
    
    // Gộp vật phẩm theo tên, loại và cấp độ
    const groupedItems = {};
    player.inventory.forEach((item, index) => {
      const key = `${item.name}_${item.type}_${item.grade}`;
      if (!groupedItems[key]) {
        groupedItems[key] = { 
          item: item, 
          count: 0, 
          indices: [],
          totalValue: 0 
        };
      }
      
      // Xử lý số lượng đặc biệt cho vật liệu có thuộc tính quantity
      const itemQuantity = item.quantity || 1;
      groupedItems[key].count += itemQuantity;
      groupedItems[key].indices.push(index);
      groupedItems[key].totalValue += (item.sellPrice || 0) * itemQuantity;
    });

    // Sắp xếp theo loại vật phẩm
    const sortedItems = Object.entries(groupedItems).sort(([,a], [,b]) => {
      const typeOrder = ["đan dược", "vũ khí", "yêu đan", "vật liệu", "ngọc", "tinh túy", "linh hồn"];
      const aTypeIndex = typeOrder.indexOf(a.item.type || "khác");
      const bTypeIndex = typeOrder.indexOf(b.item.type || "khác");
      if (aTypeIndex !== bTypeIndex) {
        return aTypeIndex - bTypeIndex;
      }
      return (a.item.name || "").localeCompare(b.item.name || "");
    });

    let itemIndex = 0;
    let currentType = "";
    
    sortedItems.forEach(([key, data]) => {
      const { item, count, totalValue } = data;
      
      // Đảm bảo item có đầy đủ thuộc tính
      const itemType = item.type || "khác";
      const itemName = item.name || "Vật phẩm không tên";
      const itemGrade = item.grade || "phàm khí";
      const itemRarity = item.rarity || "thường";
      const itemSellPrice = item.sellPrice || 0;
      
      // Hiển thị header cho loại vật phẩm mới
      if (itemType !== currentType) {
        currentType = itemType;
        const typeIcon = itemType === "đan dược" ? "💊" : 
                        itemType === "vũ khí" ? "⚔️" :
                        itemType === "yêu đan" ? "🔮" : 
                        itemType === "vật liệu" ? "🧰" : 
                        itemType === "ngọc" ? "💎" :
                        itemType === "tinh túy" ? "✨" :
                        itemType === "linh hồn" ? "👻" : "📦";
        inventoryText += `\n${typeIcon} ${itemType.toUpperCase()}:\n`;
      }
      
      itemIndex++;
      const gradeIcon = getGradeIcon(itemGrade);
      const rarityIcon = getRarityIcon(itemRarity);

      // Tạo chuỗi hiển thị số lượng - luôn hiển thị số lượng nếu > 1
      let quantityDisplay = count > 1 ? ` x${count}` : "";

      inventoryText += `${itemIndex}. ${gradeIcon}${rarityIcon} ${itemName}${quantityDisplay}`;
      
      // Hiển thị thông tin đặc biệt cho từng loại
      if (itemType === "vũ khí" && item.attack) {
        inventoryText += ` (💥${item.attack})`;
      }
      
      // Hiển thị giá bán rõ ràng
      if (count === 1) {
        inventoryText += ` - 💎${itemSellPrice.toLocaleString()}`;
      } else {
        inventoryText += ` - 💎${itemSellPrice.toLocaleString()}/cái (tổng: ${totalValue.toLocaleString()})`;
      }
      inventoryText += `\n`;
    });

    const totalInventoryValue = player.inventory.reduce((sum, item) => {
      const quantity = item.quantity || 1;
      return sum + (item.sellPrice || 0) * quantity;
    }, 0);
    
    inventoryText += `\n💡 Reply số thứ tự để sử dụng (đan dược) hoặc bán vật phẩm`;
    inventoryText += `\n💊 Dùng nhiều đan dược: Reply "1 2 3" (sử dụng đan dược số 1, 2, 3)`;
    inventoryText += `\n💰 Bán theo số lượng: Reply "1 3" (bán 3 vật phẩm loại số 1)`;
    inventoryText += `\n💰 Bán nhanh nhiều vật phẩm: Reply "1-3" (bán từ vật phẩm 1 đến 3)`;
    inventoryText += `\n📊 Tổng giá trị kho: ${totalInventoryValue.toLocaleString()} linh thạch`;
    inventoryText += `\n💰 Linh thạch hiện có: ${player.spiritStones.toLocaleString()}`;
    inventoryText += `\n📦 Tổng số vật phẩm: ${player.inventory.length} (${Object.keys(groupedItems).length} loại)`;

    return api.sendMessage(inventoryText, event.threadID, (error, info) => {
      if (!error) {
        global.client.handleReply.push({
          name: this.config.name,
          messageID: info.messageID,
          author: userID,
          type: "inventory_action_grouped",
          data: sortedItems.map(([key, data]) => data)
        });
      }
    });
  }

  

  // Thông tin nhân vật
  if (choice === '7' || choice === 'thông tin' || choice === 'info' || choice === 'nhân vật') {
    try {
      console.log("[DEBUG] Direct command - Getting player stats");
      const playerStats = getPlayerStats(player);
      
      if (!playerStats || playerStats.length === 0) {
        console.log("[ERROR] playerStats is empty or undefined in direct command");
        return api.sendMessage("❌ Lỗi: Không thể lấy thông tin nhân vật!", event.threadID, event.messageID);
      }
      
      console.log("[DEBUG] Direct command - Sending player stats, length:", playerStats.length);
      return api.sendMessage(playerStats, event.threadID, event.messageID);
    } catch (error) {
      console.error("[ERROR] Direct command case 8 failed:", error);
      return api.sendMessage(`❌ Lỗi khi hiển thị thông tin nhân vật: ${error.message}`, event.threadID, event.messageID);
    }
  }

  // Độ kiếp
  if (choice === '4' || choice === 'độ kiếp' || choice === 'kiếp' || choice === 'tribulation') {
    if (isDaoCoreInjured(player)) {
      const timeLeft = getDaoCoreInjuryTimeLeft(player);
      return api.sendMessage(`💀 Đạo cơ đang bị thương! Không thể độ kiếp.\n⏰ Cần chờ ${timeLeft} phút hoặc dùng đan dược chữa trị`, event.threadID, event.messageID);
    }

    if (!isReadyForTribulation(player)) {
      const currentStage = getCurrentStage(player.level);
      const currentPhase = getCurrentPhase(player.level);
      const currentDisplayLevel = getDisplayLevelName(player);
      const expToNext = getExpToLevel(player.level);
      const progressPercent = Math.floor((player.exp / expToNext) * 100);
      
      return api.sendMessage(
        `⚡ THÔNG TIN ĐỘ KIẾP:\n\n` +
        `🏆 Cảnh giới hiện tại: ${currentDisplayLevel}\n` +
        `📊 Chi tiết: ${currentPhase} ${currentStage}\n` +
        `⚡ Kinh nghiệm: ${player.exp.toLocaleString()}/${expToNext.toLocaleString()} (${progressPercent}%)\n\n` +
        `❌ Chưa đủ điều kiện độ kiếp!\n` +
        `📋 Yêu cầu:\n` +
        `   • Cảnh giới từ Trúc Cơ trở lên\n` +
        `   • Đạt Viên Mãn (100% kinh nghiệm)\n\n` +
        `💡 Hãy tu luyện thêm để đạt Viên Mãn và chuẩn bị cho lôi kiếp!`,
        event.threadID, event.messageID
      );
    }

    const currentStage = getCurrentStage(player.level);
    const currentPhase = getCurrentPhase(player.level);
    const currentDisplayLevel = getDisplayLevelName(player);
    const nextStageIndex = Math.floor((player.level + 1) / 4);
    const nextStageName = STAGES[nextStageIndex] || STAGES[STAGES.length - 1];
    const nextDisplayLevel = `${nextStageName} Sơ Kỳ`;
    
    let confirmText = `⚡ ĐỘ KIẾP ${currentStage.toUpperCase()}:\n\n`;
    confirmText += `🏆 Cảnh giới hiện tại: ${currentDisplayLevel}\n`;
    confirmText += `📊 Chi tiết: ${currentPhase} ${currentStage} (Viên Mãn)\n`;
    confirmText += `🎯 Cảnh giới sau độ kiếp: ${nextDisplayLevel}\n`;
    confirmText += `⚡ Kinh nghiệm: ${player.exp.toLocaleString()}/${getExpToLevel(player.level).toLocaleString()} (100%)\n\n`;
    confirmText += `⚠️ CẢNH BÁO:\n`;
    confirmText += `   • Tỷ lệ thành công: 50%\n`;
    confirmText += `   • Thất bại sẽ làm tổn thương đạo cơ (30 phút)\n`;
    confirmText += `   • Cần đan dược từ linh khí trở lên để chữa\n\n`;
    confirmText += `1. ⚡ Bắt đầu độ kiếp\n`;
    confirmText += `2. ❌ Hủy bỏ\n\n`;
    confirmText += `💡 Reply số thứ tự để chọn`;

    return api.sendMessage(confirmText, event.threadID, (error, info) => {
      if (!error) {
        global.client.handleReply.push({
          name: this.config.name,
          messageID: info.messageID,
          author: userID,
          type: "tribulation_confirm"
        });
      }
    });
  }

  // Tu luyện bằng linh thạch
  if (choice === '5' || choice === 'tu luyện' || choice === 'tu') {
    const recommendedCost = getSpiritStoneCultivationCost(player.level);
    let cultivateText = `🧘 TU LUYỆN BẰNG LINH THẠCH:\n\n`;
    
    if (player.spiritRoot) {
      const spiritIcon = getSpiritRootIcon(player.spiritRoot.grade);
      cultivateText += `${spiritIcon} Linh căn: ${player.spiritRoot.grade}\n`;
      cultivateText += `⚡ Hệ số tu luyện: x${player.spiritRoot.multiplier}\n\n`;
    }
    
    cultivateText += `📊 TRẠNG THÁI HIỆN TẠI:\n`;
    cultivateText += `🏆 Cảnh giới: ${getDisplayLevelName(player)}\n`;
    cultivateText += `⚡ Kinh nghiệm: ${player.exp}/${getExpToLevel(player.level)}\n`;
    cultivateText += `💎 Linh thạch: ${player.spiritStones.toLocaleString()}\n\n`;
    
    cultivateText += `💰 CHI PHÍ TU LUYỆN:\n`;
    cultivateText += `• 1 linh thạch = 1 kinh nghiệm cơ bản\n`;
    if (player.spiritRoot?.multiplier > 1.0) {
      cultivateText += `• Với linh căn của bạn: 1 linh thạch = ${player.spiritRoot.multiplier} kinh nghiệm\n`;
    }
    cultivateText += `• Khuyến nghị cho cảnh giới hiện tại: ${recommendedCost.toLocaleString()} linh thạch\n\n`;
    
    cultivateText += `📋 CÁCH SỬ DỤNG:\n`;
    cultivateText += `1. 💎 Tu luyện 100 linh thạch\n`;
    cultivateText += `2. 💎 Tu luyện 500 linh thạch\n`;
    cultivateText += `3. 💎 Tu luyện 1,000 linh thạch\n`;
    cultivateText += `4. 💎 Tu luyện ${recommendedCost.toLocaleString()} linh thạch (khuyến nghị)\n`;
    cultivateText += `5. 🎯 Tự nhập số lượng\n\n`;
    cultivateText += `💡 Reply số thứ tự hoặc dùng: .tu tu [số linh thạch]`;
    
    if (isDaoCoreInjured(player)) {
      cultivateText += `\n⚠️ Đạo cơ bị thương - không thể tu luyện!`;
    } else if (isPlayerInjured(player)) {
      cultivateText += `\n⚠️ Đang bị thương - không thể tu luyện!`;
    }
    
    return api.sendMessage(cultivateText, event.threadID, (error, info) => {
      if (!error) {
        global.client.handleReply.push({
          name: this.config.name,
          messageID: info.messageID,
          author: userID,
          type: "cultivation_menu",
          data: { recommendedCost }
        });
      }
    });
  }

  // Xem chi tiết công thức luyện đan
  if (choice === 'detail' && args[1]) {
    const recipeIndex = parseInt(args[1]) - 1;
    const recipes = getAlchemyRecipes();
    
    if (recipeIndex >= 0 && recipeIndex < recipes.length) {
      const recipe = recipes[recipeIndex];
      const gradeIcon = getGradeIcon(recipe.grade);
      
      let detailText = `🧪 CHI TIẾT CÔNG THỨC:\n\n`;
      detailText += `${gradeIcon} ${recipe.name}\n`;
      detailText += `📋 ${recipe.description}\n`;
      detailText += `💎 Chi phí: ${recipe.spiritStones} linh thạch\n`;
      detailText += `📊 Yêu cầu level: ${recipe.minLevel}\n`;
      detailText += `⚗️ Tỷ lệ thành công: 85%\n`;
      detailText += `🧰 Nguyên liệu cần thiết:\n`;
      recipe.materials.forEach((mat, index) => {
        detailText += `   • ${mat.name} x${mat.quantity}\n`;
      });
      
      // Kiểm tra điều kiện
      const canCraft = canCraftPotion(player, recipe);
      if (canCraft.canCraft) {
        detailText += `\n✅ Có thể luyện đan`;
      } else {
        detailText += `\n❌ ${canCraft.reason}`;
      }
      
      return api.sendMessage(detailText, event.threadID, event.messageID);
    } else {
      return api.sendMessage("❌ Số công thức không hợp lệ!", event.threadID, event.messageID);
    }
  }

  // Tu luyện với số lượng cụ thể
  if (choice === 'tu' && args[1]) {
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) {
      return api.sendMessage("❌ Vui lòng nhập số linh thạch hợp lệ!\nVí dụ: .tu tu 1000", event.threadID, event.messageID);
    }
    
    const result = cultivateWithSpiritStones(player, amount);
    
    if (!result.success) {
      let errorMsg = `❌ TU LUYỆN THẤT BẠI!\n\n`;
      errorMsg += `📝 Lý do: ${result.reason}\n`;
      
      if (result.reason.includes("Không đủ linh thạch")) {
        errorMsg += `💎 Linh thạch hiện có: ${player.spiritStones.toLocaleString()}\n`;
        errorMsg += `💎 Cần: ${amount.toLocaleString()}\n`;
        errorMsg += `💎 Thiếu: ${(amount - player.spiritStones).toLocaleString()}`;
      }
      
      return api.sendMessage(errorMsg, event.threadID, event.messageID);
    }
    
    savePlayer(userID, player);
    
    let successMsg = `✅ TU LUYỆN THÀNH CÔNG!\n\n`;
    successMsg += `💎 Đã sử dụng: ${amount.toLocaleString()} linh thạch\n`;
    successMsg += `⚡ Kinh nghiệm nhận được: ${result.finalExp.toLocaleString()}`;
    
    if (result.spiritRootBonus) {
      successMsg += ` (Bonus linh căn x${player.spiritRoot.multiplier})`;
    }
    successMsg += `\n`;
    
    if (result.levelUp) {
      successMsg += `🎉 LEVEL UP! Lên cảnh giới ${getLevelName(result.newLevel)}!\n`;
    }
    
    successMsg += `\n📊 TRẠNG THÁI SAU TU LUYỆN:\n`;
    successMsg += `🏆 Cảnh giới: ${getDisplayLevelName(player)}\n`;
    successMsg += `⚡ Kinh nghiệm: ${player.exp}/${getExpToLevel(player.level)}\n`;
    successMsg += `💎 Linh thạch còn lại: ${player.spiritStones.toLocaleString()}\n`;
    
    if (isReadyForTribulation(player)) {
      successMsg += `⚡ Đã sẵn sàng độ kiếp!`;
    }
    
    return api.sendMessage(successMsg, event.threadID, event.messageID);
  }

  // Luyện khí với vũ khí cụ thể
  if (choice === 'luyenkhi' && args[1] && args[2]) {
    const weaponIndex = parseInt(args[1]) - 1;
    const spiritAmount = parseInt(args[2]);
    
    if (isNaN(weaponIndex) || isNaN(spiritAmount) || spiritAmount <= 0) {
      return api.sendMessage("❌ Cú pháp không đúng!\nVí dụ: .tu luyenkhi 1 500\n(luyện khí vũ khí số 1 với 500 linh thạch)", event.threadID, event.messageID);
    }
    
    const result = upgradeWeapon(player, weaponIndex, spiritAmount);
    
    if (!result.success) {
      let errorMsg = `❌ LUYỆN KHÍ THẤT BẠI!\n\n`;
      errorMsg += `📝 Lý do: ${result.reason}\n`;
      
      if (result.failed) {
        errorMsg += `💔 Đã mất ${result.lostSpiritStones} linh thạch do thất bại\n`;
        errorMsg += `💎 Linh thạch còn lại: ${player.spiritStones.toLocaleString()}\n`;
        errorMsg += `💡 Hãy thử lại với may mắn hơn!`;
      }
      
      savePlayer(userID, player);
      return api.sendMessage(errorMsg, event.threadID, event.messageID);
    }
    
    savePlayer(userID, player);
    
    let successMsg = `🔥 LUYỆN KHÍ THÀNH CÔNG!\n\n`;
    successMsg += `⚔️ Vũ khí: ${result.weaponName}\n`;
    successMsg += `📈 Level: ${result.newLevel - 1} → ${result.newLevel}\n`;
    successMsg += `💥 Sát thương: ${result.oldAttack} → ${result.newAttack}\n`;
    successMsg += `💎 Đã sử dụng: ${spiritAmount.toLocaleString()} linh thạch\n`;
    successMsg += `💰 Linh thạch còn lại: ${player.spiritStones.toLocaleString()}\n\n`;
    successMsg += `🎉 Vũ khí của bạn đã mạnh hơn!`;
    
    return api.sendMessage(successMsg, event.threadID, event.messageID);
  }

  // Luyện khí menu
  if (choice === '6' || choice === 'luyenkhi' || choice === 'luyện khí') {
    const weaponsForUpgrade = player.inventory.filter(item => item.type === "vũ khí" && canUseWeapon(player, item));
    
    if (weaponsForUpgrade.length === 0) {
      return api.sendMessage("⚔️ Bạn không có vũ khí nào để luyện khí!\n💡 Hãy đánh quái để tìm vũ khí hoặc sử dụng vũ khí ban đầu.", event.threadID, event.messageID);
    }
    
    let weaponUpgradeText = `🔥 LUYỆN KHÍ - NÂNG CẤP VŨ KHÍ:\n\n`;
    weaponUpgradeText += `📊 CHI PHÍ NÂNG CẤP:\n`;
    weaponUpgradeText += `Level 0→1: 100 linh thạch (80% thành công)\n`;
    weaponUpgradeText += `Level 1→2: 200 linh thạch (75% thành công)\n`;
    weaponUpgradeText += `Level 2→3: 400 linh thạch (70% thành công)\n`;
    weaponUpgradeText += `...\n`;
    weaponUpgradeText += `Level 9→10: 51,200 linh thạch (10% thành công)\n\n`;
    weaponUpgradeText += `⚡ HIỆU QUẢ: +15% sát thương mỗi level\n\n`;
    
    weaponUpgradeText += `🗡️ VŨ KHÍ CÓ THỂ NÂNG CẤP:\n`;
    weaponsForUpgrade.forEach((weapon, index) => {
      const gradeIcon = getGradeIcon(weapon.grade);
      const level = weapon.level || 0;
      const upgradeCosts = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200];
      const nextCost = level < 10 ? upgradeCosts[level] : "MAX";
      
      weaponUpgradeText += `${index + 1}. ${gradeIcon} ${weapon.name}\n`;
      weaponUpgradeText += `   💥 Sát thương: ${weapon.attack} | Level: ${level}/10\n`;
      if (level < 10) {
        weaponUpgradeText += `   💎 Chi phí nâng cấp: ${nextCost} linh thạch\n`;
      } else {
        weaponUpgradeText += `   ✅ Đã đạt cấp tối đa\n`;
      }
      weaponUpgradeText += `\n`;
    });
    
    weaponUpgradeText += `💎 Linh thạch hiện có: ${player.spiritStones.toLocaleString()}\n`;
    weaponUpgradeText += `💡 Reply số thứ tự vũ khí để luyện khí\n`;
    weaponUpgradeText += `💡 Hoặc dùng: .tu luyenkhi [số vũ khí] [số linh thạch]`;
    
    return api.sendMessage(weaponUpgradeText, event.threadID, (error, info) => {
      if (!error) {
        global.client.handleReply.push({
          name: this.config.name,
          messageID: info.messageID,
          author: userID,
          type: "weapon_upgrade_menu",
          data: weaponsForUpgrade
        });
      }
    });
  }

  return api.sendMessage("❓ Lựa chọn không hợp lệ. Gõ `.tu` để xem menu hoặc `.tu help` để xem chi tiết.", event.threadID, event.messageID);
};

module.exports.handleReply = async ({ event, api, handleReply }) => {
  const userID = event.senderID;
  const choice = event.body.trim();

  if (userID !== handleReply.author) {
    return api.sendMessage("⚠️ Bạn không có quyền sử dụng menu này!", event.threadID, event.messageID);
  }

  // Xử lý tạo nhân vật
  if (handleReply.type === "create_character") {
    const weaponTypes = getWeaponTypes();
    const selectedType = parseInt(choice);
    
    if (selectedType >= 1 && selectedType <= weaponTypes.length) {
      const chosenType = weaponTypes[selectedType - 1];
      
      // Yêu cầu nhập tên nhân vật
      let nameText = `🎭 ĐẶT TÊN NHÂN VẬT:\n\n`;
      nameText += `Bạn đã chọn: ${chosenType.name}\n`;
      nameText += `🗡️ ${chosenType.description}\n\n`;
      nameText += `📝 Vui lòng nhập tên cho nhân vật của bạn:\n`;
      nameText += `💡 Tên không được chứa ký tự đặc biệt và tối đa 20 ký tự`;
      
      return api.sendMessage(nameText, event.threadID, (error, info) => {
        if (!error) {
          global.client.handleReply.push({
            name: this.config.name,
            messageID: info.messageID,
            author: userID,
            type: "input_character_name",
            data: chosenType
          });
        }
      });
    } else {
      return api.sendMessage("❓ Lựa chọn không hợp lệ! Vui lòng chọn từ 1-4.", event.threadID, event.messageID);
    }
  }

  // Xử lý nhập tên nhân vật
  if (handleReply.type === "input_character_name") {
    const chosenType = handleReply.data;
    let characterName = choice.trim();
    
    // Kiểm tra tên hợp lệ
    if (!characterName || characterName.length > 20 || !/^[a-zA-ZÀ-ỹ0-9\s]+$/.test(characterName)) {
      return api.sendMessage("❌ Tên không hợp lệ! Vui lòng nhập tên chỉ gồm chữ cái, số và khoảng trắng, tối đa 20 ký tự.", event.threadID, event.messageID);
    }
    
    // Kiểm tra tên đã tồn tại
    if (checkCharacterNameExists(characterName)) {
      return api.sendMessage(`❌ Tên nhân vật "${characterName}" đã được sử dụng bởi người chơi khác!\n💡 Vui lòng chọn tên khác cho nhân vật của bạn.`, event.threadID, event.messageID);
    }
    
    // Hiển thị thông báo về việc kiểm tra linh căn
    let spiritCheckMsg = `🎭 TẠO NHÂN VẬT: ${characterName}\n\n`;
    spiritCheckMsg += `🎯 Loại nhân vật: ${chosenType.name}\n`;
    spiritCheckMsg += `🗡️ ${chosenType.description}\n\n`;
    spiritCheckMsg += `🔮 KIỂM TRA LINH CĂN:\n`;
    spiritCheckMsg += `Linh căn quyết định tốc độ tu luyện của bạn:\n`;
    spiritCheckMsg += `• Hạ phẩm linh căn (60%): Tu luyện bình thường\n`;
    spiritCheckMsg += `• Trung phẩm linh căn (30%): +30% tốc độ tu luyện\n`;
    spiritCheckMsg += `• Thượng phẩm linh căn (10%): +60% tốc độ tu luyện\n\n`;
    spiritCheckMsg += `1. 🔮 Bắt đầu kiểm tra linh căn\n`;
    spiritCheckMsg += `2. ⏭️ Bỏ qua (tự động nhận Hạ phẩm linh căn)\n\n`;
    spiritCheckMsg += `💡 Reply số thứ tự để chọn`;
    
    return api.sendMessage(spiritCheckMsg, event.threadID, (error, info) => {
      if (!error) {
        global.client.handleReply.push({
          name: this.config.name,
          messageID: info.messageID,
          author: userID,
          type: "spirit_root_check",
          data: { characterName, chosenType }
        });
      }
    });
  }

  // Xử lý kiểm tra linh căn
  if (handleReply.type === "spirit_root_check") {
    const { characterName, chosenType } = handleReply.data;
    const checkChoice = parseInt(choice);
    
    let spiritRoot;
    let checkMessage = "";
    
    if (checkChoice === 1) {
      // Kiểm tra linh căn
      spiritRoot = generateSpiritRoot();
      checkMessage = `🔮 KIỂM TRA LINH CĂN HOÀN TẤT!\n\n`;
      checkMessage += `✨ Kết quả kiểm tra...\n`;
      checkMessage += `🌟 Linh căn của ${characterName}: ${spiritRoot.grade}!\n`;
      checkMessage += `⚡ Hệ số tu luyện: x${spiritRoot.multiplier}\n`;
      checkMessage += `📋 ${spiritRoot.description}\n\n`;
    } else if (checkChoice === 2) {
      // Bỏ qua - tự động nhận Hạ phẩm linh căn
      spiritRoot = {
        grade: "Hạ phẩm linh căn",
        multiplier: 1.0,
        description: "Linh căn tầm thường, tu luyện với tốc độ bình thường"
      };
      checkMessage = `⏭️ ĐÃ BỎ QUA KIỂM TRA!\n\n`;
      checkMessage += `🟫 Tự động nhận: ${spiritRoot.grade}\n`;
      checkMessage += `⚡ Hệ số tu luyện: x${spiritRoot.multiplier}\n`;
      checkMessage += `📋 ${spiritRoot.description}\n\n`;
    } else {
      return api.sendMessage("❓ Lựa chọn không hợp lệ! Vui lòng chọn 1 hoặc 2.", event.threadID, event.messageID);
    }
    
    // Tạo nhân vật mới với linh căn đã chọn
    const characterData = {
      name: characterName,
      weaponType: chosenType.weaponType
    };
    
    const newPlayer = createNewPlayerWithSpiritRoot(userID, characterData, spiritRoot);
    
    let welcomeMsg = checkMessage;
    welcomeMsg += `🎉 TẠO NHÂN VẬT THÀNH CÔNG!\n\n`;
    welcomeMsg += `👤 Tên nhân vật: ${characterName}\n`;
    welcomeMsg += `🎭 Loại nhân vật: ${chosenType.name}\n`;
    welcomeMsg += `🗡️ Chuyên môn: ${chosenType.description}\n`;
    
    const spiritIcon = getSpiritRootIcon(spiritRoot.grade);
    welcomeMsg += `${spiritIcon} Linh căn: ${spiritRoot.grade}\n`;
    welcomeMsg += `⚡ Hệ số tu luyện: x${spiritRoot.multiplier}\n`;
    
    // Thông báo vũ khí ban đầu
    let weaponName = "";
    switch(chosenType.weaponType) {
      case "kiếm": weaponName = "Phàm Khí Kiếm"; break;
      case "đao": weaponName = "Phàm Khí Đao"; break;
      case "thể": weaponName = "Thể Tu Quyền Thủ"; break;
      default: weaponName = "Phàm Khí Kiếm";
    }
    
    welcomeMsg += `🎁 Vũ khí ban đầu: ${weaponName}\n`;
    welcomeMsg += `💰 Phần thưởng tân thủ: 5000 linh thạch\n\n`;
    welcomeMsg += `📋 HƯỚNG DẪN:\n`;
    welcomeMsg += `1. Đánh quái để nhận kinh nghiệm và tìm vũ khí mới\n`;
    welcomeMsg += `2. Tu luyện bằng linh thạch để tăng kinh nghiệm\n`;
    welcomeMsg += `3. Luyện khí để nâng cấp vũ khí (không bán vũ khí nữa)\n`;
    welcomeMsg += `4. Sử dụng lệnh .tu để bắt đầu cuộc hành trình tu tiên\n\n`;
    welcomeMsg += `🌟 Chúc ${characterName} tu tiên thành công!`;
    
    return api.sendMessage(welcomeMsg, event.threadID, event.messageID);
  }

  let player = loadPlayer(userID);
  if (!player) {
    return api.sendMessage("❌ Lỗi: Không thể tải dữ liệu người chơi!", event.threadID, event.messageID);
  }

  if (handleReply.type === "alchemy_main") {
    const alchemyChoice = parseInt(choice);
    if (alchemyChoice === 1) {
      // Linh thảo - cửa hàng bán vật liệu luyện đan
      const materials = loadData(path.join(DATA_DIR, 'materials.json')) || [];
      
      let shopText = `🌿 LINH THẢO - CỬA HÀNG VẬT LIỆU:\n\n`;
      
      // Nhóm vật liệu theo cấp độ yêu thú
      const materialsByLevel = {
        "Phàm Thú": materials.filter(m => m.beastLevel === "Phàm Thú"),
        "Yêu Thú": materials.filter(m => m.beastLevel === "Yêu Thú"),
        "Linh Thú": materials.filter(m => m.beastLevel === "Linh Thú"),
        "Thánh Thú": materials.filter(m => m.beastLevel === "Thánh Thú"),
        "Yêu Vương": materials.filter(m => m.beastLevel === "Yêu Vương"),
        "Yêu Đế": materials.filter(m => m.beastLevel === "Yêu Đế"),
        "Thần Thú": materials.filter(m => m.beastLevel === "Thần Thú")
      };
      
      let itemIndex = 0;
      Object.entries(materialsByLevel).forEach(([level, mats]) => {
        if (mats.length > 0) {
          const levelIcon = getBeastLevelIcon(level);
          shopText += `\n${levelIcon} ${level}:\n`;
          mats.forEach(mat => {
            itemIndex++;
            const gradeIcon = getGradeFromRarity(mat.rarity) === "phàm khí" ? "🟫" :
                             getGradeFromRarity(mat.rarity) === "pháp khí" ? "🟦" :
                             getGradeFromRarity(mat.rarity) === "linh khí" ? "🟪" :
                             getGradeFromRarity(mat.rarity) === "linh bảo" ? "🟨" : "🟥";
            const sellPrice = (mat.value || 10) * 3; // Giá bán = value * 3
            const price = sellPrice + 50; // Giá mua = giá bán + 50 linh thạch
            shopText += `${itemIndex}. ${gradeIcon} ${mat.name} - 💎${price}\n`;
            shopText += `   📋 ${mat.description}\n`;
          });
        }
      });
      
      shopText += `\n💎 Linh thạch hiện có: ${player.spiritStones.toLocaleString()}`;
      shopText += `\n💡 Reply số thứ tự để mua vật liệu`;
      shopText += `\n🧪 Vật liệu dùng để luyện đan dược`;
      
      // Tạo danh sách vật liệu phẳng để xử lý reply
      const flatMaterials = [];
      Object.values(materialsByLevel).forEach(mats => {
        flatMaterials.push(...mats);
      });
      
      return api.sendMessage(shopText, event.threadID, (error, info) => {
        if (!error) {
          global.client.handleReply.push({
            name: "tu",
            messageID: info.messageID,
            author: userID,
            type: "buy_material",
            data: flatMaterials
          });
        }
      });
    } else if (alchemyChoice === 2) {
      // Luyện đan
      const recipes = getAlchemyRecipes();
      let craftText = `🧪 LUYỆN ĐAN - DANH SÁCH CÔNG THỨC:\n\n`;
      
      recipes.forEach((recipe, i) => {
        const gradeIcon = getGradeIcon(recipe.grade);
        craftText += `${i + 1}. ${gradeIcon} ${recipe.name}\n`;
      });
      
      craftText += `\n💡 CÁCH SỬ DỤNG:\n`;
      craftText += `• Reply số thứ tự để luyện 1 lần\n`;
      craftText += `• Reply "số thứ tự số lượng" để luyện nhiều lần\n`;
      craftText += `• Ví dụ: "1 5" = luyện công thức 1 với 5 lần\n`;
      craftText += `• Giới hạn: tối đa 100 lần/lượt\n\n`;
      craftText += `💰 Linh thạch hiện có: ${player.spiritStones.toLocaleString()}\n`;
      craftText += `📖 Dùng ".tu detail [số]" để xem chi tiết công thức`;
      
      return api.sendMessage(craftText, event.threadID, (error, info) => {
        if (!error) {
          global.client.handleReply.push({
            name: "tu",
            messageID: info.messageID,
            author: userID,
            type: "craft_potion",
            data: recipes
          });
        }
      });
    }
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  if (handleReply.type === "main_menu") {
    // Xử lý lựa chọn từ menu chính
    const menuChoice = parseInt(choice);

    switch (menuChoice) {
      case 1: // Đánh quái
        // Kiểm tra có vũ khí phù hợp không
        if (!hasUsableWeapon(player)) {
          const weaponTypeName = {
            "kiếm": "kiếm",
            "đao": "đao", 
            "thương": "thương",
            "cung": "cung tên"
          };
          const requiredWeapon = weaponTypeName[player.weaponType] || "vũ khí";
          return api.sendMessage(`⚔️ Bạn cần có ${requiredWeapon} để có thể đánh quái!\n💰 Hãy mua ${requiredWeapon} ở cửa hàng trước khi săn quái.\n💎 Linh thạch hiện có: ${player.spiritStones}`, event.threadID, event.messageID);
        }

        // Kiểm tra trạng thái đạo cơ bị thương
        if (isDaoCoreInjured(player)) {
          const timeLeft = getDaoCoreInjuryTimeLeft(player);
          const recoveryTime = formatTime(new Date(player.daoCoreInjuredUntil));
          return api.sendMessage(`💀 Đạo cơ đang bị hao tổn! Không thể tu luyện.\n⏰ Thời gian hồi phục: ${recoveryTime}\n💊 Hoặc dùng đan dược chữa đạo cơ (Thiên Tâm Đan, Ngũ Hành Thiên Đan, Cửu Chuyển Hoàn Hồn Đan)`, event.threadID, event.messageID);
        }

        // Kiểm tra trạng thái bị thương
        if (isPlayerInjured(player)) {
          const timeLeft = getInjuryTimeLeft(player);
          const recoveryTime = formatTime(new Date(player.injuredUntil));
          return api.sendMessage(`🩸 Bạn đang bị thương! Cần chờ ${timeLeft} phút nữa để hồi phục hoặc dùng đan dược trị thương.\n⏰ Thời gian hồi phục: ${recoveryTime}`, event.threadID, event.messageID);
        }

        // Kiểm tra máu
        if (player.hp <= 0) {
          return api.sendMessage(`💀 Bạn đã hết máu! Cần sử dụng đan dược để hồi phục máu trước khi tiếp tục săn quái.`, event.threadID, event.messageID);
        }

        // Kiểm tra máu dưới 20% - không cho phép đi săn quái
        const minHpPercent = 0.2; // 20%
        const minHpRequired = Math.floor(player.maxHp * minHpPercent);
        if (player.hp < minHpRequired) {
          const hpPercent = Math.floor((player.hp / player.maxHp) * 100);
          return api.sendMessage(`🩸 Máu quá thấp để săn quái! (${hpPercent}%)\n❤️ Máu hiện tại: ${player.hp}/${player.maxHp}\n💊 Cần hồi phục máu lên ít nhất ${minHpRequired} (20%) để có thể tiếp tục săn quái.\n💡 Sử dụng đan dược để hồi phục máu trước khi đi săn quái.`, event.threadID, event.messageID);
        }

        // Kiểm tra linh lực
        if (!canHunt(player)) {
          const recoveryTime = player.spiritPowerRecoveryTime ? formatTime(new Date(player.spiritPowerRecoveryTime)) : "Đang tính toán...";
          return api.sendMessage(`🌀 Linh lực đã kiệt! Cần chờ để hồi phục linh lực.\n💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n⏰ Hồi phục vào: ${recoveryTime}\n💡 Mỗi 1 phút sẽ hồi ${GAME_CONFIG?.combat?.spiritPowerRecoveryAmount || 10} linh lực (10 phút hồi đầy)`, event.threadID, event.messageID);
        }

        // Tiêu hao linh lực
        consumeSpiritPower(player);

        // Random quái theo cấp độ người chơi
        const monster = getRandomMonster(player.level);
        const battleResult = calculateBattleResult(player, monster);

        if (battleResult.result === "win" || battleResult.result === "lucky_win" || battleResult.result === "easy_win") {
          // Thắng (bình thường, may mắn hoặc dễ dàng)
          player.hp = battleResult.playerHpLeft;
          const finalExp = gainExpWithBoost(player, monster.exp);
          logMonsterKill(player, monster.name);

          let msg = `⚔️ CHIẾN THẮNG${battleResult.isLucky ? ' MAY MẮN' : battleResult.isEasy ? ' ÁP ĐẢO' : ''}!\n`;
          msg += `${getMonsterDisplayName(monster)} đã bị tiêu diệt!\n`;
          msg += `🗡️ Chiến đấu ${battleResult.turns} lượt\n`;
          msg += `💥 Sát thương gây ra: ${battleResult.damageDealt}\n`;
          
          if (battleResult.isLucky) {
            msg += `🍀 Thắng một cách kỳ diệu trước đối thủ mạnh hơn!\n`;
            msg += `⚠️ Bạn đã bị thương nặng trong trận chiến!\n`;
          } else if (battleResult.isEasy) {
            msg += `💪 Áp đảo hoàn toàn! Yêu thú quá yếu so với sức mạnh hiện tại!\n`;
            msg += `🛡️ Không hề bị thương trong trận chiến!\n`;
          }
          
          if (finalExp.gained > 0) {
            msg += `📈 Nhận được ${finalExp.gained} kinh nghiệm`;
            if (hasExpBoost(player)) {
              msg += ` (x${player.expBoostMultiplier} buff)`;
            }
            if (finalExp.spiritRootBonus) {
              msg += ` (Bonus linh căn x${player.spiritRoot.multiplier})`;
            }
            msg += `\n`;
          } else {
            // Kiểm tra nếu có thể độ kiếp
            if (isReadyForTribulation(player)) {
              msg += `⚡ Đã đạt Viên Mãn - Không thể nhận thêm kinh nghiệm!\n`;
              msg += `💡 Hãy độ kiếp để lên cảnh giới mới!\n`;
            } else {
              msg += `⚡ Đã đạt Viên Mãn cảnh giới ${getCurrentStage(player.level)}!\n`;
              msg += `💡 Tiếp tục tu luyện để nâng cao sức mạnh!\n`;
            }
          }
          
          // Kiểm tra nếu có thể độ kiếp
          if (isReadyForTribulation(player)) {
            msg += `⚡ Đã sẵn sàng độ kiếp! Dùng lệnh .tu 9\n`;
          }
          msg += `\n`;

          const drop = dropEquipment(monster);
          if (drop) {
            addEquipment(player, drop);
            const gradeIcon = getGradeIcon(drop.grade);
            const rarityIcon = getRarityIcon(drop.rarity);

            msg += `🎁 PHẦN THƯỞNG: ${gradeIcon}${rarityIcon} ${drop.name}\n`;
            if (player.settings?.autoSell) {
              msg += `   💰 Tự động bán: +${drop.sellPrice} linh thạch\n`;
            } else {
              msg += `   💎 Giá trị: ${drop.sellPrice} linh thạch\n`;
            }
            msg += `   🧰 Vật liệu luyện đan\n`;
          } else {
            msg += `💨 Không có chiến lợi phẩm...\n`;
          }

          msg += `\n📊 TRẠNG THÁI:\n`;
          msg += `🏆 Cảnh giới: ${getDisplayLevelName(player)}\n`;
          msg += `⚡ Kinh nghiệm: ${player.exp}/${getExpToLevel(player.level)}\n`;
          msg += `❤️ Máu: ${player.hp}/${player.maxHp}\n`;
          msg += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
          msg += `💎 Linh thạch: ${player.spiritStones.toLocaleString()}\n`;

          // Hiển thị trạng thái buff
          if (hasExpBoost(player)) {
            const boostTimeLeft = Math.ceil((new Date(player.expBoostUntil) - new Date()) / 60000);
            msg += `⚡ Buff kinh nghiệm: x${player.expBoostMultiplier} (${boostTimeLeft}p)\n`;
          }
          if (hasInjuryImmunity(player)) {
            const immunityTimeLeft = Math.ceil((new Date(player.immunityUntil) - new Date()) / 60000);
            msg += `🛡️ Miễn nhiễm: ${immunityTimeLeft}p\n`;
          }

          msg += `\n🕐 ${formatTime(new Date())}`;
          savePlayer(userID, player);
          return api.sendMessage(msg, event.threadID, event.messageID);
        } else if (battleResult.result === "escape") {
          // Chạy trốn thành công nhưng bị hậu quả
          
          // Cạn kiệt linh khí (chỉ còn 10% hoặc tối thiểu 1 điểm)
          player.spiritPower = Math.max(1, Math.floor(player.spiritPower * 0.1));
          
          // Bị thương nhẹ (mất 30% máu)
          const healthLoss = Math.floor(player.maxHp * 0.3);
          player.hp = Math.max(1, player.hp - healthLoss);
          
          // Bị thương nhẹ trong 5 phút (nếu không có miễn nhiễm)
          if (!hasInjuryImmunity(player)) {
            const injuredTime = new Date();
            injuredTime.setMinutes(injuredTime.getMinutes() + 5); // 5 phút bị thương nhẹ
            player.injuredUntil = injuredTime.toISOString();
          }
          
          let msg = `💨 CHẠY TRỐN THÀNH CÔNG!\n`;
          msg += `Bạn đã kịp thời thoát khỏi ${getMonsterDisplayName(monster)}!\n`;
          msg += `🏃‍♂️ May mắn thoát được một tai họa lớn!\n\n`;
          msg += `⚠️ HẬU QUẢ CỦA VIỆC CHẠY TRỐN:\n`;
          msg += `💔 Mất ${healthLoss} máu do hoảng loạn\n`;
          msg += `💫 Linh khí cạn kiệt do sử dụng thần thức chạy trốn\n`;
          
          if (!hasInjuryImmunity(player)) {
            const recoveryTime = formatTime(new Date(player.injuredUntil));
            msg += `🩸 Bị thương nhẹ (5 phút): ${recoveryTime}\n`;
          } else {
            msg += `🛡️ Miễn nhiễm bị thương vẫn còn hiệu lực\n`;
          }
          
          msg += `\n📊 TRẠNG THÁI:\n`;
          msg += `❤️ Máu: ${player.hp}/${player.maxHp}\n`;
          msg += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
          msg += `💡 Mẹo: Hãy nâng cao cảnh giới trước khi thách thức yêu thú mạnh hơn!\n`;
          msg += `🕐 ${formatTime(new Date())}`;
          savePlayer(userID, player);
          return api.sendMessage(msg, event.threadID, event.messageID);
        } else {
          // Thua - mất máu và bị thương
          player.hp = battleResult.playerHpLeft; // Luôn là 1 máu
          
          if (hasInjuryImmunity(player)) {
            let msg = `⚔️ Bạn đã bị ${getMonsterDisplayName(monster)} đánh bại!\n`;
            msg += `🗡️ Chiến đấu ${battleResult.turns} lượt\n`;
            msg += `💔 Mất ${battleResult.damageReceived} máu\n`;
            msg += `❤️ Máu còn lại: ${player.hp}/${player.maxHp}\n`;
            msg += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
            msg += `🛡️ Hiệu ứng miễn nhiễm vẫn còn hiệu lực - không bị thương.\n`;
            msg += `🕐 Thời gian: ${formatTime(new Date())}`;
            savePlayer(userID, player);
            return api.sendMessage(msg, event.threadID, event.messageID);
          } else {
            // Luôn bị thương 10 phút khi thua
            injurePlayer(player);
            
            // Xử lý thương tích nặng cho yêu thú cao hơn cấp
            if (battleResult.isSevereInjury) {
              // Bị thương nặng - thời gian hồi phục gấp đôi (20 phút)
              const currentInjuryTime = new Date(player.injuredUntil);
              currentInjuryTime.setMinutes(currentInjuryTime.getMinutes() + 10); // Thêm 10 phút nữa = 20 phút tổng
              player.injuredUntil = currentInjuryTime.toISOString();
            }
            
            const recoveryTime = formatTime(new Date(player.injuredUntil));
            let msg = `💀 THẤT BẠI!\n`;
            msg += `${getMonsterDisplayName(monster)} đã đánh bại bạn!\n`;
            msg += `🗡️ Chiến đấu ${battleResult.turns} lượt\n`;
            msg += `💔 Mất ${battleResult.damageReceived} máu\n\n`;
            
            if (battleResult.isSevereInjury) {
              msg += `💥 BỊ THƯƠNG CỰC NẶNG:\n`;
              msg += `⚠️ Thách thức yêu thú vượt quá sức mạnh!\n`;
              msg += `🩸 Thời gian hồi phục kéo dài (20 phút)\n`;
            } else {
              msg += `🩸 BỊ THƯƠNG NẶNG:\n`;
              msg += `⚠️ Cần 10 phút để hồi phục hoàn toàn\n`;
            }
            
            msg += `❤️ Máu: ${player.hp}/${player.maxHp}\n`;
            msg += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
            msg += `⏰ Thời gian hồi phục: ${recoveryTime}\n`;
            msg += `💊 Hoặc sử dụng đan dược để trị thương ngay\n\n`;
            msg += `💡 Mẹo: Nâng cao cảnh giới trước khi thách thức yêu thú mạnh hơn!\n`;
            msg += `🕐 ${formatTime(new Date())}`;
            
            savePlayer(userID, player);
            return api.sendMessage(msg, event.threadID, event.messageID);
          }
        }

      case 2: // Đan các
        let alchemyText = `🏪 ĐAN CÁC:\n\n`;
        alchemyText += `1. 🌿 Linh thảo\n`;
        alchemyText += `2. 🧪 Luyện đan\n\n`;
        alchemyText += `💡 Reply số thứ tự để chọn`;
        return api.sendMessage(alchemyText, event.threadID, (error, info) => {
          if (!error) {
            global.client.handleReply.push({
              name: "tu",
              messageID: info.messageID,
              author: userID,
              type: "alchemy_main"
            });
          }
        });

      case 3: // Kho đồ
        if (!player.inventory.length)
          return api.sendMessage("📦 Kho đồ trống! Hãy đánh quái để thu thập trang bị!", event.threadID, event.messageID);

        let inventoryText = "📦 KHO ĐỒ:\n\n";
        
        // Gộp vật phẩm theo tên, loại và cấp độ
        const groupedItems = {};
        player.inventory.forEach((item, index) => {
          const key = `${item.name}_${item.type}_${item.grade}`;
          if (!groupedItems[key]) {
            groupedItems[key] = { 
              item: item, 
              count: 0, 
              indices: [],
              totalValue: 0 
            };
          }
          // Xử lý số lượng đặc biệt cho vật liệu có thuộc tính quantity
          const itemQuantity = item.quantity || 1;
          groupedItems[key].count += itemQuantity;
          groupedItems[key].indices.push(index);
          groupedItems[key].totalValue += (item.sellPrice || 0) * itemQuantity;
        });

        // Sắp xếp theo loại vật phẩm
        const sortedItems = Object.entries(groupedItems).sort(([,a], [,b]) => {
          const typeOrder = ["đan dược", "vũ khí", "yêu đan", "vật liệu", "ngọc", "tinh túy", "linh hồn"];
          const aTypeIndex = typeOrder.indexOf(a.item.type || "khác");
          const bTypeIndex = typeOrder.indexOf(b.item.type || "khác");
          if (aTypeIndex !== bTypeIndex) {
            return aTypeIndex - bTypeIndex;
          }
          return (a.item.name || "").localeCompare(b.item.name || "");
        });

        let itemIndex = 0;
        let currentType = "";
        
        sortedItems.forEach(([key, data]) => {
          const { item, count, totalValue } = data;
          
          // Đảm bảo item có đầy đủ thuộc tính
          const itemType = item.type || "khác";
          const itemName = item.name || "Vật phẩm không tên";
          const itemGrade = item.grade || "phàm khí";
          const itemRarity = item.rarity || "thường";
          const itemSellPrice = item.sellPrice || 0;
          
          // Hiển thị header cho loại vật phẩm mới
          if (itemType !== currentType) {
            currentType = itemType;
            const typeIcon = itemType === "đan dược" ? "💊" : 
                            itemType === "vũ khí" ? "⚔️" :
                            itemType === "yêu đan" ? "🔮" : 
                            itemType === "vật liệu" ? "🧰" : 
                            itemType === "ngọc" ? "💎" :
                            itemType === "tinh túy" ? "✨" :
                            itemType === "linh hồn" ? "👻" : "📦";
            inventoryText += `\n${typeIcon} ${itemType.toUpperCase()}:\n`;
          }
          
          itemIndex++;
          const gradeIcon = getGradeIcon(itemGrade);
          const rarityIcon = getRarityIcon(itemRarity);

          // Tạo chuỗi hiển thị số lượng - luôn hiển thị số lượng nếu > 1
          let quantityDisplay = count > 1 ? ` x${count}` : "";

          inventoryText += `${itemIndex}. ${gradeIcon}${rarityIcon} ${itemName}${quantityDisplay}`;
          
          // Hiển thị thông tin đặc biệt cho từng loại
          if (itemType === "vũ khí" && item.attack) {
            inventoryText += ` (💥${item.attack})`;
          }
          
          // Hiển thị giá bán rõ ràng
          if (count === 1) {
            inventoryText += ` - 💎${itemSellPrice.toLocaleString()}`;
          } else {
            inventoryText += ` - 💎${itemSellPrice.toLocaleString()}/cái (tổng: ${totalValue.toLocaleString()})`;
          }
          inventoryText += `\n`;
        });

        const totalInventoryValue = player.inventory.reduce((sum, item) => {
          const quantity = item.quantity || 1;
          return sum + (item.sellPrice || 0) * quantity;
        }, 0);
        
        inventoryText += `\n💡 Reply số thứ tự để sử dụng (đan dược) hoặc bán vật phẩm`;
        inventoryText += `\n💊 Dùng nhiều đan dược: Reply "1 2 3" (sử dụng đan dược số 1, 2, 3)`;
        inventoryText += `\n💰 Bán theo số lượng: Reply "1 3" (bán 3 vật phẩm loại số 1)`;
        inventoryText += `\n💰 Bán nhanh nhiều vật phẩm: Reply "1-3" (bán từ vật phẩm 1 đến 3)`;
        inventoryText += `\n📊 Tổng giá trị kho: ${totalInventoryValue.toLocaleString()} linh thạch`;
        inventoryText += `\n💰 Linh thạch hiện có: ${player.spiritStones.toLocaleString()}`;
        inventoryText += `\n📦 Tổng số vật phẩm: ${player.inventory.length} (${Object.keys(groupedItems).length} loại)`;

        return api.sendMessage(inventoryText, event.threadID, (error, info) => {
          if (!error) {
            global.client.handleReply.push({
              name: "tu",
              messageID: info.messageID,
              author: userID,
              type: "inventory_action_grouped",
              data: sortedItems.map(([key, data]) => data)
            });
          }
        });
        break;

      case 4: // Độ kiếp
        if (isDaoCoreInjured(player)) {
          const timeLeft = getDaoCoreInjuryTimeLeft(player);
          return api.sendMessage(`💀 Đạo cơ đang bị thương! Không thể độ kiếp.\n⏰ Cần chờ ${timeLeft} phút hoặc dùng đan dược chữa trị`, event.threadID, event.messageID);
        }

        if (!isReadyForTribulation(player)) {
          const currentStage = getCurrentStage(player.level);
          const currentPhase = getCurrentPhase(player.level);
          const currentDisplayLevel = getDisplayLevelName(player);
          const expToNext = getExpToLevel(player.level);
          const progressPercent = Math.floor((player.exp / expToNext) * 100);
          
          return api.sendMessage(
            `⚡ THÔNG TIN ĐỘ KIẾP:\n\n` +
            `🏆 Cảnh giới hiện tại: ${currentDisplayLevel}\n` +
            `📊 Chi tiết: ${currentPhase} ${currentStage}\n` +
            `⚡ Kinh nghiệm: ${player.exp.toLocaleString()}/${expToNext.toLocaleString()} (${progressPercent}%)\n\n` +
            `❌ Chưa đủ điều kiện độ kiếp!\n` +
            `📋 Yêu cầu:\n` +
            `   • Cảnh giới từ Trúc Cơ trở lên\n` +
            `   • Đạt Viên Mãn (100% kinh nghiệm)\n\n` +
            `💡 Hãy tu luyện thêm để đạt Viên Mãn và chuẩn bị cho lôi kiếp!`,
            event.threadID, event.messageID
          );
        }

        const currentStage = getCurrentStage(player.level);
        const currentPhase = getCurrentPhase(player.level);
        const currentDisplayLevel = getDisplayLevelName(player);
        const nextStageIndex = Math.floor((player.level + 1) / 4);
        const nextStageName = STAGES[nextStageIndex] || STAGES[STAGES.length - 1];
        const nextDisplayLevel = `${nextStageName} Sơ Kỳ`;
        
        let confirmText = `⚡ ĐỘ KIẾP ${currentStage.toUpperCase()}:\n\n`;
        confirmText += `🏆 Cảnh giới hiện tại: ${currentDisplayLevel}\n`;
        confirmText += `📊 Chi tiết: ${currentPhase} ${currentStage} (Viên Mãn)\n`;
        confirmText += `🎯 Cảnh giới sau độ kiếp: ${nextDisplayLevel}\n`;
        confirmText += `⚡ Kinh nghiệm: ${player.exp.toLocaleString()}/${getExpToLevel(player.level).toLocaleString()} (100%)\n\n`;
        confirmText += `⚠️ CẢNH BÁO:\n`;
        confirmText += `   • Tỷ lệ thành công: 50%\n`;
        confirmText += `   • Thất bại sẽ làm tổn thương đạo cơ (30 phút)\n`;
        confirmText += `   • Cần đan dược từ linh khí trở lên để chữa\n\n`;
        confirmText += `1. ⚡ Bắt đầu độ kiếp\n`;
        confirmText += `2. ❌ Hủy bỏ\n\n`;
        confirmText += `💡 Reply số thứ tự để chọn`;

        return api.sendMessage(confirmText, event.threadID, (error, info) => {
          if (!error) {
            global.client.handleReply.push({
              name: "tu",
              messageID: info.messageID,
              author: userID,
              type: "tribulation_confirm"
            });
          }
        });

      case 5: // Tu luyện
        const recommendedCost = getSpiritStoneCultivationCost(player.level);
        let cultivateText = `🧘 TU LUYỆN BẰNG LINH THẠCH:\n\n`;
        
        if (player.spiritRoot) {
          const spiritIcon = getSpiritRootIcon(player.spiritRoot.grade);
          cultivateText += `${spiritIcon} Linh căn: ${player.spiritRoot.grade}\n`;
          cultivateText += `⚡ Hệ số tu luyện: x${player.spiritRoot.multiplier}\n\n`;
        }
        
        cultivateText += `📊 TRẠNG THÁI HIỆN TẠI:\n`;
        cultivateText += `🏆 Cảnh giới: ${getDisplayLevelName(player)}\n`;
        cultivateText += `⚡ Kinh nghiệm: ${player.exp}/${getExpToLevel(player.level)}\n`;
        cultivateText += `💎 Linh thạch: ${player.spiritStones.toLocaleString()}\n\n`;
        
        cultivateText += `💰 CHI PHÍ TU LUYỆN:\n`;
        cultivateText += `• 1 linh thạch = 1 kinh nghiệm cơ bản\n`;
        if (player.spiritRoot?.multiplier > 1.0) {
          cultivateText += `• Với linh căn của bạn: 1 linh thạch = ${player.spiritRoot.multiplier} kinh nghiệm\n`;
        }
        cultivateText += `• Khuyến nghị cho cảnh giới hiện tại: ${recommendedCost.toLocaleString()} linh thạch\n\n`;
        
        cultivateText += `📋 CÁCH SỬ DỤNG:\n`;
        cultivateText += `1. 💎 Tu luyện 100 linh thạch\n`;
        cultivateText += `2. 💎 Tu luyện 500 linh thạch\n`;
        cultivateText += `3. 💎 Tu luyện 1,000 linh thạch\n`;
        cultivateText += `4. 💎 Tu luyện ${recommendedCost.toLocaleString()} linh thạch (khuyến nghị)\n`;
        cultivateText += `5. 🎯 Tự nhập số lượng\n\n`;
        cultivateText += `💡 Reply số thứ tự để chọn`;
        
        if (isDaoCoreInjured(player)) {
          cultivateText += `\n⚠️ Đạo cơ bị thương - không thể tu luyện!`;
        } else if (isPlayerInjured(player)) {
          cultivateText += `\n⚠️ Đang bị thương - không thể tu luyện!`;
        }
        
        return api.sendMessage(cultivateText, event.threadID, (error, info) => {
          if (!error) {
            global.client.handleReply.push({
              name: "tu",
              messageID: info.messageID,
              author: userID,
              type: "cultivation_menu",
              data: { recommendedCost }
            });
          }
        });

      case 6: // Luyện khí
        const weaponsToUpgrade = player.inventory.filter(item => item.type === "vũ khí" && canUseWeapon(player, item));
        
        if (weaponsToUpgrade.length === 0) {
          return api.sendMessage("⚔️ Bạn không có vũ khí nào để luyện khí!\n💡 Hãy đánh quái để tìm vũ khí hoặc sử dụng vũ khí ban đầu.", event.threadID, event.messageID);
        }
        
        let weaponUpgradeText = `🔥 LUYỆN KHÍ - NÂNG CẤP VŨ KHÍ:\n\n`;
        weaponUpgradeText += `📊 CHI PHÍ NÂNG CẤP:\n`;
        weaponUpgradeText += `Level 0→1: 100 linh thạch (80% thành công)\n`;
        weaponUpgradeText += `Level 1→2: 200 linh thạch (75% thành công)\n`;
        weaponUpgradeText += `Level 2→3: 400 linh thạch (70% thành công)\n`;
        weaponUpgradeText += `...\n`;
        weaponUpgradeText += `Level 9→10: 51,200 linh thạch (10% thành công)\n\n`;
        weaponUpgradeText += `⚡ HIỆU QUẢ: +15% sát thương mỗi level\n\n`;
        
        weaponUpgradeText += `🗡️ VŨ KHÍ CÓ THỂ NÂNG CẤP:\n`;
        weaponsToUpgrade.forEach((weapon, index) => {
          const gradeIcon = getGradeIcon(weapon.grade);
          const level = weapon.level || 0;
          const upgradeCosts = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200];
          const nextCost = level < 10 ? upgradeCosts[level] : "MAX";
          
          weaponUpgradeText += `${index + 1}. ${gradeIcon} ${weapon.name}\n`;
          weaponUpgradeText += `   💥 Sát thương: ${weapon.attack} | Level: ${level}/10\n`;
          if (level < 10) {
            weaponUpgradeText += `   💎 Chi phí nâng cấp: ${nextCost} linh thạch\n`;
          } else {
            weaponUpgradeText += `   ✅ Đã đạt cấp tối đa\n`;
          }
          weaponUpgradeText += `\n`;
        });
        
        weaponUpgradeText += `💎 Linh thạch hiện có: ${player.spiritStones.toLocaleString()}\n`;
        weaponUpgradeText += `💡 Reply số thứ tự vũ khí để luyện khí\n`;
        weaponUpgradeText += `💡 Hoặc dùng: .tu luyenkhi [số vũ khí] [số linh thạch]`;
        
        return api.sendMessage(weaponUpgradeText, event.threadID, (error, info) => {
          if (!error) {
            global.client.handleReply.push({
              name: "tu",
              messageID: info.messageID,
              author: userID,
              type: "weapon_upgrade_menu",
              data: weaponsToUpgrade
            });
          }
        });

      case 7: // Thông tin nhân vật  
        console.log("[DEBUG] Getting player stats for case 7");
        try {
          const playerStats = getPlayerStats(player);
          console.log("[DEBUG] Player stats generated, length:", playerStats?.length || 0);
          console.log("[DEBUG] Sending player stats message");
          
          // Xóa handleReply sau khi xử lý
          const replyIndex7 = global.client.handleReply.findIndex(reply => reply.messageID === handleReply.messageID);
          if (replyIndex7 !== -1) {
            global.client.handleReply.splice(replyIndex7, 1);
          }
          
          if (!playerStats || playerStats.length === 0) {
            console.log("[ERROR] playerStats is empty or undefined");
            return api.sendMessage("❌ Lỗi: Không thể lấy thông tin nhân vật!", event.threadID, event.messageID);
          }
          
          return api.sendMessage(playerStats, event.threadID, event.messageID);
        } catch (error) {
          console.error("[ERROR] Case 7 failed:", error);
          // Xóa handleReply trong trường hợp lỗi
          const replyIndex7 = global.client.handleReply.findIndex(reply => reply.messageID === handleReply.messageID);
          if (replyIndex7 !== -1) {
            global.client.handleReply.splice(replyIndex7, 1);
          }
          return api.sendMessage(`❌ Lỗi khi hiển thị thông tin nhân vật: ${error.message}`, event.threadID, event.messageID);
        }

      default:
        return api.sendMessage("❓ Lựa chọn không hợp lệ! Vui lòng chọn từ 1-7.", event.threadID, event.messageID);
    }
  }

  // Xử lý reply cho hunt menu
  if (handleReply.type === "hunt_menu") {
    const huntChoice = parseInt(choice);

    if (huntChoice === 1) {
      // Đánh quái ngẫu nhiên
      if (isPlayerInjured(player)) {
        const timeLeft = getInjuryTimeLeft(player);
        const recoveryTime = formatTime(new Date(player.injuredUntil));
        return api.sendMessage(`🩸 Bạn đang bị thương! Cần chờ ${timeLeft} phút nữa để hồi phục.\n⏰ Thời gian hồi phục: ${recoveryTime}`, event.threadID, event.messageID);
      }

      // Kiểm tra máu dưới 20%
      const minHpPercent = 0.2;
      const minHpRequired = Math.floor(player.maxHp * minHpPercent);
      if (player.hp < minHpRequired) {
        const hpPercent = Math.floor((player.hp / player.maxHp) * 100);
        return api.sendMessage(`🩸 Máu quá thấp để săn quái! (${hpPercent}%)\n❤️ Máu hiện tại: ${player.hp}/${player.maxHp}\n💊 Cần hồi phục máu lên ít nhất ${minHpRequired} (20%) để có thể tiếp tục săn quái.`, event.threadID, event.messageID);
      }

      const monster = getRandomMonster(player.level);
      const battleResult = calculateBattleResult(player, monster);

      if (battleResult.result === "win" || battleResult.result === "lucky_win" || battleResult.result === "easy_win") {
        // Thắng
        player.hp = battleResult.playerHpLeft;
        const finalExp = gainExpWithBoost(player, monster.exp);
        logMonsterKill(player, monster.name);

        let msg = `⚔️ CHIẾN THẮNG${battleResult.isLucky ? ' MAY MẮN' : battleResult.isEasy ? ' ÁP ĐẢO' : ''}!\n`;
        msg += `${getMonsterDisplayName(monster)} đã bị tiêu diệt!\n`;
        msg += `🗡️ Chiến đấu ${battleResult.turns} lượt\n`;
        msg += `💥 Sát thương gây ra: ${battleResult.damageDealt}\n`;
        
        if (battleResult.isLucky) {
          msg += `🍀 Thắng một cách kỳ diệu trước đối thủ mạnh hơn!\n`;
          msg += `⚠️ Bạn đã bị thương nặng trong trận chiến!\n`;
        } else if (battleResult.isEasy) {
          msg += `💪 Áp đảo hoàn toàn! Yêu thú quá yếu so với sức mạnh hiện tại!\n`;
          msg += `🛡️ Không hề bị thương trong trận chiến!\n`;
        }
        
        if (finalExp > 0) {
          msg += `📈 Nhận được ${finalExp} kinh nghiệm`;
          if (hasExpBoost(player)) {
            msg += ` (x${player.expBoostMultiplier} buff)`;
          }
          msg += `\n`;
        } else {
          // Kiểm tra nếu có thể độ kiếp
          if (isReadyForTribulation(player)) {
            msg += `⚡ Đã đạt Viên Mãn - Không thể nhận thêm kinh nghiệm!\n`;
            msg += `💡 Hãy độ kiếp để lên cảnh giới mới!\n`;
          } else {
            msg += `⚡ Đã đạt Viên Mãn cảnh giới ${getCurrentStage(player.level)}!\n`;
            msg += `💡 Tiếp tục tu luyện để nâng cao sức mạnh!\n`;
          }
        }
        
        // Kiểm tra nếu có thể độ kiếp
        if (isReadyForTribulation(player)) {
          msg += `⚡ Đã sẵn sàng độ kiếp! Dùng lệnh .tu 9\n`;
        }
        msg += `\n`;

        const drop = dropEquipment(monster);
        if (drop) {
          addEquipment(player, drop);
          const gradeIcon = getGradeIcon(drop.grade);
          const rarityIcon = getRarityIcon(drop.rarity);

          if (drop.type === "đan dược") {
            msg += `🎁 PHẦN THƯỞNG: ${gradeIcon}${rarityIcon} ${drop.name}\n`;
            msg += `   📋 ${drop.description}\n`;
          } else {
            msg += `🎁 PHẦN THƯỞNG: ${gradeIcon}${rarityIcon} ${drop.name}\n`;
            if (player.settings?.autoSell) {
              msg += `   💰 Tự động bán: +${drop.sellPrice} linh thạch\n`;
            } else {
              msg += `   💎 Giá trị: ${drop.sellPrice} linh thạch\n`;
            }
          }
        } else {
          msg += `💨 Không có chiến lợi phẩm...\n`;
        }

        msg += `\n📊 TRẠNG THÁI:\n`;
        msg += `🏆 Cảnh giới: ${getDisplayLevelName(player)}\n`;
        msg += `⚡ Kinh nghiệm: ${player.exp}/${getExpToLevel(player.level)}\n`;
        msg += `❤️ Máu: ${player.hp}/${player.maxHp}\n`;
        msg += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
        msg += `💎 Linh thạch: ${player.spiritStones.toLocaleString()}\n`;

        // Hiển thị trạng thái buff
        if (hasExpBoost(player)) {
          const boostTimeLeft = Math.ceil((new Date(player.expBoostUntil) - new Date()) / 60000);
          msg += `⚡ Buff kinh nghiệm: x${player.expBoostMultiplier} (${boostTimeLeft}p)\n`;
        }
        if (hasInjuryImmunity(player)) {
          const immunityTimeLeft = Math.ceil((new Date(player.immunityUntil) - new Date()) / 60000);
          msg += `🛡️ Miễn nhiễm: ${immunityTimeLeft}p\n`;
        }

        msg += `\n🕐 ${formatTime(new Date())}`;
        savePlayer(userID, player);
        return api.sendMessage(msg, event.threadID, event.messageID);
      } else if (battleResult.result === "escape") {
        // Chạy trốn thành công nhưng bị hậu quả
        
        // Cạn kiệt linh khí (chỉ còn 10% hoặc tối thiểu 1 điểm)
        player.spiritPower = Math.max(1, Math.floor(player.spiritPower * 0.1));
        
        // Bị thương nhẹ (mất 30% máu)
        const healthLoss = Math.floor(player.maxHp * 0.3);
        player.hp = Math.max(1, player.hp - healthLoss);
        
        // Bị thương nhẹ trong 5 phút (nếu không có miễn nhiễm)
        if (!hasInjuryImmunity(player)) {
          const injuredTime = new Date();
          injuredTime.setMinutes(injuredTime.getMinutes() + 5); // 5 phút bị thương nhẹ
          player.injuredUntil = injuredTime.toISOString();
        }
        
        let msg = `💨 CHẠY TRỐN THÀNH CÔNG!\n`;
        msg += `Bạn đã kịp thời thoát khỏi ${getMonsterDisplayName(monster)}!\n`;
        msg += `🏃‍♂️ May mắn thoát được một tai họa lớn!\n\n`;
        msg += `⚠️ HẬU QUẢ CỦA VIỆC CHẠY TRỐN:\n`;
        msg += `💔 Mất ${healthLoss} máu do hoảng loạn\n`;
        msg += `💫 Linh khí cạn kiệt do sử dụng thần thức chạy trốn\n`;
        
        if (!hasInjuryImmunity(player)) {
          const recoveryTime = formatTime(new Date(player.injuredUntil));
          msg += `🩸 Bị thương nhẹ (5 phút): ${recoveryTime}\n`;
        } else {
          msg += `🛡️ Miễn nhiễm bị thương vẫn còn hiệu lực\n`;
        }
        
        msg += `\n📊 TRẠNG THÁI:\n`;
        msg += `❤️ Máu: ${player.hp}/${player.maxHp}\n`;
        msg += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
        msg += `🕐 Thời gian: ${formatTime(new Date())}`;
        savePlayer(userID, player);
        return api.sendMessage(msg, event.threadID, event.messageID);
      } else {
        // Thua - mất máu và bị thương
        player.hp = battleResult.playerHpLeft; // Luôn là 1 máu
        
        if (hasInjuryImmunity(player)) {
          let msg = `⚔️ Bạn đã bị ${getMonsterDisplayName(monster)} đánh bại!\n`;
          msg += `🗡️ Chiến đấu ${battleResult.turns} lượt\n`;
          msg += `💔 Mất ${battleResult.damageReceived} máu\n`;
          msg += `❤️ Máu còn lại: ${player.hp}/${player.maxHp}\n`;
          msg += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
          msg += `🛡️ Hiệu ứng miễn nhiễm vẫn còn hiệu lực - không bị thương.\n`;
          msg += `🕐 Thời gian: ${formatTime(new Date())}`;
          savePlayer(userID, player);
          return api.sendMessage(msg, event.threadID, event.messageID);
        } else {
          // Luôn bị thương 10 phút khi thua
          injurePlayer(player);
          
          // Xử lý thương tích nặng cho yêu thú cao hơn cấp
          if (battleResult.isSevereInjury) {
            // Bị thương nặng - thời gian hồi phục gấp đôi (20 phút)
            const currentInjuryTime = new Date(player.injuredUntil);
            currentInjuryTime.setMinutes(currentInjuryTime.getMinutes() + 10); // Thêm 10 phút nữa = 20 phút tổng
            player.injuredUntil = currentInjuryTime.toISOString();
          }
          
          const recoveryTime = formatTime(new Date(player.injuredUntil));
          let msg = `💀 THẤT BẠI!\n`;
          msg += `${getMonsterDisplayName(monster)} đã đánh bại bạn!\n`;
          msg += `🗡️ Chiến đấu ${battleResult.turns} lượt\n`;
          msg += `💔 Mất ${battleResult.damageReceived} máu\n\n`;
          
          if (battleResult.isSevereInjury) {
            msg += `💥 BỊ THƯƠNG CỰC NẶNG:\n`;
            msg += `⚠️ Thách thức yêu thú vượt quá sức mạnh!\n`;
            msg += `🩸 Thời gian hồi phục kéo dài (20 phút)\n`;
          } else {
            msg += `🩸 BỊ THƯƠNG NẶNG:\n`;
            msg += `⚠️ Cần 10 phút để hồi phục hoàn toàn\n`;
          }
          
          msg += `❤️ Máu: ${player.hp}/${player.maxHp}\n`;
          msg += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
          msg += `⏰ Thời gian hồi phục: ${recoveryTime}\n`;
          msg += `💊 Hoặc sử dụng đan dược để trị thương ngay\n\n`;
          msg += `💡 Mẹo: Nâng cao cảnh giới trước khi thách thức yêu thú mạnh hơn!\n`;
          msg += `🕐 Thời gian hiện tại: ${formatTime(new Date())}`;
          
          savePlayer(userID, player);
          return api.sendMessage(msg, event.threadID, event.messageID);
        }
      }
    } else if (huntChoice === 2) {
      // Dùng đan dược trị thương
      const healingPotions = player.inventory.filter(item => item.type === "đan dược");
      if (healingPotions.length === 0) {
        return api.sendMessage("❌ Bạn không có đan dược trị thương! Hãy mua ở cửa hàng.", event.threadID, event.messageID);
      }

      let potionText = `💊 Đan dược trị thương:\n\n`;
      healingPotions.forEach((potion, i) => {
        potionText += `${i + 1}. ${potion.name} - Hồi phục ngay lập tức\n`;
      });
      potionText += `\n💡 Reply số thứ tự để sử dụng đan dược`;

      return api.sendMessage(potionText, event.threadID, (error, info) => {
        if (!error) {
          global.client.handleReply.push({
            name: "tu",
            messageID: info.messageID,
            author: userID,
            type: "heal_potion",
            data: healingPotions
          });
        }
      });
    }
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  // Xử lý reply cho dùng đan dược
  if (handleReply.type === "heal_potion") {
    const potionIndex = parseInt(choice) - 1;
    if (potionIndex >= 0 && potionIndex < handleReply.data.length) {
      const potion = handleReply.data[potionIndex];

      // Tìm và xóa đan dược khỏi inventory
      const inventoryIndex = player.inventory.findIndex(item => 
        item.name === potion.name && item.type === "đan dược"
      );
      if (inventoryIndex !== -1) {
        player.inventory.splice(inventoryIndex, 1);
        applyPotionEffects(player, potion);
        savePlayer(userID, player);

        let msg = `✅ Đã sử dụng ${potion.name}!\n`;
        msg += `💊 ${potion.description}\n`;

        // Hiển thị trạng thái hiện tại
        if (hasExpBoost(player)) {
          const boostTimeLeft = Math.ceil((new Date(player.expBoostUntil) - new Date()) / 60000);
          msg += `⚡ Buff exp: ${player.expBoostMultiplier}x (${boostTimeLeft} phút)\n`;
        }
        if (hasInjuryImmunity(player)) {
          const immunityTimeLeft = Math.ceil((new Date(player.immunityUntil) - new Date()) / 60000);
          msg += `🛡️ Miễn nhiễm bị thương (${immunityTimeLeft} phút)\n`;
        }
        if (!isPlayerInjured(player)) {
          msg += `🩹 Trạng thái: Khỏe mạnh`;
        }

        return api.sendMessage(msg, event.threadID, event.messageID);
      }
    }
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  // Xử lý reply cho cửa hàng
  if (handleReply.type === "shop_category") {
    const categoryIndex = parseInt(choice);
    if (categoryIndex >= 1 && categoryIndex <= 5) {
      const gradeName = getGradeName(categoryIndex);
      const gradeIcon = getGradeIcon(gradeName);
      const gradeItems = EQUIPMENT_LIST.filter(eq => eq.grade === gradeName);

      let shopText = `🏪 Cửa hàng - ${gradeIcon} ${gradeName.toUpperCase()}:\n\n`;
      if (gradeItems.length > 0) {
        gradeItems.forEach((eq, i) => {
          if (eq.type === "đan dược") {
            shopText += `${i + 1}. 💊 ${eq.name} - 💎${eq.buyPrice}\n`;
            shopText += `   📝 ${eq.description}\n`;
          } else {
            shopText += `• ${eq.name} - 💎${eq.sellPrice} (Nhặt từ quái)\n`;
          }
        });

        // Tạo danh sách đan dược có thể mua
        const buyableItems = gradeItems.filter(eq => eq.type === "đan dược");
        if (buyableItems.length > 0) {
          shopText += `\n💡 Reply số thứ tự để mua đan dược`;
          return api.sendMessage(shopText, event.threadID, (error, info) => {
            if (!error) {
              global.client.handleReply.push({
                name: "tu",
                messageID: info.messageID,
                author: userID,
                type: "buy_potion",
                data: buyableItems,
                grade: gradeName
              });
            }
          });
        }
      } else {
        shopText += `Chưa có trang bị nào trong danh mục này!`;
      }
      shopText += `\n💡 Vật phẩm nhặt từ quái, đan dược mua bằng linh thạch`;
      return api.sendMessage(shopText, event.threadID, event.messageID);
    }
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  // Xử lý reply cho mua đan dược
  if (handleReply.type === "buy_potion") {
    const potionIndex = parseInt(choice) - 1;
    if (potionIndex >= 0 && potionIndex < handleReply.data.length) {
      const potion = handleReply.data[potionIndex];

      // Hiển thị tùy chọn mua số lượng
      let buyText = `🛒 Mua ${potion.name}:\n\n`;
      buyText += `💎 Giá: ${potion.buyPrice} linh thạch/viên\n`;
      buyText += `💰 Linh thạch hiện có: ${player.spiritStones}\n\n`;
      buyText += `1. Mua 1 viên - 💎${potion.buyPrice}\n`;
      if (player.spiritStones >= potion.buyPrice * 5) {
        buyText += `2. Mua 5 viên - 💎${potion.buyPrice * 5}\n`;
      }
      if (player.spiritStones >= potion.buyPrice * 10) {
        buyText += `3. Mua 10 viên - 💎${potion.buyPrice * 10}\n`;
      }
      buyText += `\n💡 Reply số thứ tự để chọn số lượng`;

      return api.sendMessage(buyText, event.threadID, (error, info) => {
        if (!error) {
          global.client.handleReply.push({
            name: "tu",
            messageID: info.messageID,
            author: userID,
            type: "buy_quantity",
            data: potion
          });
        }
      });
    }
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  // Xử lý reply cho mua vật liệu
  if (handleReply.type === "buy_material") {
    const materialIndex = parseInt(choice) - 1;
    if (materialIndex >= 0 && materialIndex < handleReply.data.length) {
      const material = handleReply.data[materialIndex];
      const sellPrice = (material.value || 10) * 3; // Giá bán = value * 3
      const price = sellPrice + 50; // Giá mua = giá bán + 50 linh thạch
      
      if (player.spiritStones >= price) {
        // Tạo vật liệu để thêm vào kho
        const materialItem = {
          name: material.name || "Vật liệu không tên",
          type: "vật liệu",
          grade: getGradeFromRarity(material.rarity || "Thường"),
          rarity: material.rarity || "Thường",
          description: material.description || "Vật liệu luyện đan",
          sellPrice: sellPrice, // Giá bán = value * 3
          buyPrice: price, // Giá mua = giá bán + 50
          beastLevel: material.beastLevel || "Phàm Thú",
          uses: material.uses || ["Luyện đan"],
          obtainedAt: new Date().toISOString()
        };
        
        player.spiritStones -= price;
        addEquipment(player, materialItem);
        savePlayer(userID, player);
        
        const gradeIcon = getGradeIcon(materialItem.grade);
        let buyMsg = `✅ ĐÃ MUA THÀNH CÔNG!\n\n`;
        buyMsg += `${gradeIcon} ${material.name}\n`;
        buyMsg += `📋 ${material.description}\n`;
        buyMsg += `💎 Đã trả: ${price.toLocaleString()} linh thạch\n`;
        buyMsg += `💰 Linh thạch còn lại: ${player.spiritStones.toLocaleString()}\n`;
        buyMsg += `📦 Đã thêm vào kho đồ để luyện đan`;
        
        return api.sendMessage(buyMsg, event.threadID, event.messageID);
      } else {
        const shortage = price - player.spiritStones;
        return api.sendMessage(`❌ Không đủ linh thạch!\n💎 Cần: ${price.toLocaleString()}\n💰 Có: ${player.spiritStones.toLocaleString()}\n💎 Thiếu: ${shortage.toLocaleString()}`, event.threadID, event.messageID);
      }
    }
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  // Xử lý reply cho mua số lượng đan dược
  if (handleReply.type === "buy_quantity") {
    const quantityChoice = parseInt(choice);
    const potion = handleReply.data;
    let quantity = 0;

    switch (quantityChoice) {
      case 1: quantity = 1; break;
      case 2: quantity = 5; break;
      case 3: quantity = 10; break;
      default: return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
    }

    const totalCost = potion.buyPrice * quantity;
    if (player.spiritStones >= totalCost) {
      player.spiritStones -= totalCost;
      addEquipment(player, potion, quantity);
      savePlayer(userID, player);
      return api.sendMessage(`✅ Đã mua ${quantity} viên ${potion.name} với ${totalCost} linh thạch!\n💊 ${potion.description}\n💎 Linh thạch còn lại: ${player.spiritStones}`, event.threadID, event.messageID);
    } else {
      return api.sendMessage(`❌ Không đủ linh thạch! Cần ${totalCost} linh thạch, bạn chỉ có ${player.spiritStones}.`, event.threadID, event.messageID);
    }
  }

  // Xử lý reply cho bán trang bị
  if (handleReply.type === "sell_equipment") {
    const sellChoice = parseInt(choice);
    const equipGroup = handleReply.data;
    let sellQuantity = 0;

    switch (sellChoice) {
      case 1: sellQuantity = 1; break;
      case 2: sellQuantity = equipGroup.count; break;
      default: return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
    }

    // Xóa số lượng trang bị khỏi inventory
    let removed = 0;
    for (let i = player.inventory.length - 1; i >= 0 && removed < sellQuantity; i--) {
      if (player.inventory[i].name === equipGroup.name && player.inventory[i].type === equipGroup.item.type) {
        player.inventory.splice(i, 1);
        removed++;
      }
    }

    const totalEarned = equipGroup.item.sellPrice * sellQuantity;
    player.spiritStones += totalEarned;
    savePlayer(userID, player);

    const gradeIcon = getGradeIcon(equipGroup.item.grade);
    return api.sendMessage(`💰 Đã bán ${sellQuantity} ${gradeIcon} ${equipGroup.name} được ${totalEarned} linh thạch!\n💎 Linh thạch hiện tại: ${player.spiritStones}`, event.threadID, event.messageID);
  }

  // Xử lý reply cho inventory action (sử dụng đan dược hoặc bán trang bị)
  if (handleReply.type === "inventory_action") {
    const itemIndex = parseInt(choice) - 1;
    const totalPotionGroups = handleReply.data.potionGroups.length;

    if (itemIndex >= 0 && itemIndex < totalPotionGroups) {
      // Sử dụng đan dược
      const potionGroup = handleReply.data.potionGroups[itemIndex];
      const inventoryIndex = player.inventory.findIndex(item => 
        item.name === potionGroup.name && item.type === "đan dược"
      );

      if (inventoryIndex !== -1) {
        const potion = player.inventory[inventoryIndex];
        player.inventory.splice(inventoryIndex, 1);
        applyPotionEffects(player, potion);
        savePlayer(userID, player);

        let msg = `✅ Đã sử dụng ${potion.name}!\n`;
        msg += `💊 ${potion.description}\n`;
        if (potionGroup.count > 1) {
          msg += `📦 Còn lại: ${potionGroup.count - 1} viên\n`;
        }

        // Hiển thị trạng thái hiện tại
        if (hasExpBoost(player)) {
          const boostTimeLeft = Math.ceil((new Date(player.expBoostUntil) - new Date()) / 60000);
          msg += `⚡ Buff exp: ${player.expBoostMultiplier}x (${boostTimeLeft} phút)\n`;
        }
        if (hasInjuryImmunity(player)) {
          const immunityTimeLeft = Math.ceil((new Date(player.immunityUntil) - new Date()) / 60000);
          msg += `🛡️ Miễn nhiễm bị thương (${immunityTimeLeft} phút)\n`;
        }
        if (!isPlayerInjured(player)) {
          msg += `🩹 Trạng thái: Khỏe mạnh`;
        }

        return api.sendMessage(msg, event.threadID, event.messageID);
      }
    } else if (itemIndex >= totalPotionGroups && itemIndex < totalPotionGroups + handleReply.data.equipmentGroups.length) {
      // Bán trang bị
      const equipIndex = itemIndex - totalPotionGroups;
      const equipGroup = handleReply.data.equipmentGroups[equipIndex];

      // Hiển thị tùy chọn bán
      let sellText = `💰 Bán ${equipGroup.name}:\n\n`;
      sellText += `1. Bán 1 cái - 💎${equipGroup.item.sellPrice}\n`;
      if (equipGroup.count > 1) {
        sellText += `2. Bán tất cả (${equipGroup.count} cái) - 💎${equipGroup.item.sellPrice * equipGroup.count}\n`;
      }
      sellText += `\n💡 Reply số thứ tự để chọn`;

      return api.sendMessage(sellText, event.threadID, (error, info) => {
        if (!error) {
          global.client.handleReply.push({
            name: "tu",
            messageID: info.messageID,
            author: userID,
            type: "sell_equipment",
            data: equipGroup
          });
        }
      });
    }
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  // Xử lý reply cho luyện đan
  if (handleReply.type === "craft_potion") {
    const input = choice.trim();
    
    // Kiểm tra nếu có format "số công thức số lượng" (ví dụ: "1 5")
    const parts = input.split(' ').filter(p => p.trim());
    let recipeIndex = -1;
    let quantity = 1;
    
    if (parts.length === 2) {
      // Format: "1 5" - luyện công thức 1 với số lượng 5
      recipeIndex = parseInt(parts[0]) - 1;
      quantity = parseInt(parts[1]);
      
      if (isNaN(quantity) || quantity <= 0 || quantity > 100) {
        return api.sendMessage("❌ Số lượng không hợp lệ! Vui lòng nhập từ 1-100.", event.threadID, event.messageID);
      }
    } else if (parts.length === 1) {
      // Format cũ: chỉ số công thức
      recipeIndex = parseInt(parts[0]) - 1;
      quantity = 1;
    } else {
      return api.sendMessage("❌ Cú pháp không đúng!\nVí dụ: 1 (luyện 1 lần) hoặc 1 5 (luyện 5 lần)", event.threadID, event.messageID);
    }
    
    if (recipeIndex >= 0 && recipeIndex < handleReply.data.length) {
      const recipe = handleReply.data[recipeIndex];
      
      // Kiểm tra khả năng luyện với số lượng yêu cầu
      const totalSpiritStones = recipe.spiritStones * quantity;
      const requiredMaterials = {};
      recipe.materials.forEach(mat => {
        requiredMaterials[mat.name] = mat.quantity * quantity;
      });
      
      // Kiểm tra điều kiện
      if (player.level < recipe.minLevel) {
        return api.sendMessage(`❌ Cần đạt level ${recipe.minLevel} để luyện đan này!`, event.threadID, event.messageID);
      }
      
      if (player.spiritStones < totalSpiritStones) {
        return api.sendMessage(`❌ Không đủ linh thạch!\n💎 Cần: ${totalSpiritStones.toLocaleString()}\n💰 Có: ${player.spiritStones.toLocaleString()}`, event.threadID, event.messageID);
      }
      
      // Kiểm tra nguyên liệu
      const playerMaterials = getPlayerMaterials(player);
      for (const [matName, requiredCount] of Object.entries(requiredMaterials)) {
        let playerCount = 0;
        playerMaterials.forEach(item => {
          if (item.name === matName) {
            playerCount += (item.quantity || 1);
          }
        });

        if (playerCount < requiredCount) {
          return api.sendMessage(`❌ Thiếu nguyên liệu!\n🧰 Cần: ${matName} x${requiredCount}\n📦 Có: ${playerCount}`, event.threadID, event.messageID);
        }
      }
      
      // Hiển thị xác nhận luyện đan
      let confirmText = `🧪 XÁC NHẬN LUYỆN ĐAN:\n\n`;
      const gradeIcon = getGradeIcon(recipe.grade);
      confirmText += `${gradeIcon} ${recipe.name}`;
      if (quantity > 1) confirmText += ` x${quantity}`;
      confirmText += `\n📋 ${recipe.description}\n\n`;
      confirmText += `💎 Chi phí tổng: ${totalSpiritStones.toLocaleString()} linh thạch\n`;
      confirmText += `🧰 Nguyên liệu sẽ tiêu hao:\n`;
      Object.entries(requiredMaterials).forEach(([matName, count]) => {
        confirmText += `   • ${matName} x${count}\n`;
      });
      confirmText += `\n⚗️ Tỷ lệ thành công mỗi lần: 85%\n`;
      if (quantity > 1) {
        confirmText += `📊 Dự kiến: ~${Math.round(quantity * 0.85)} thành công, ~${quantity - Math.round(quantity * 0.85)} thất bại\n`;
      }
      confirmText += `\n1. 🧪 Bắt đầu luyện đan\n`;
      confirmText += `2. ❌ Hủy bỏ\n\n`;
      confirmText += `💡 Reply số thứ tự để chọn`;
      
      return api.sendMessage(confirmText, event.threadID, (error, info) => {
        if (!error) {
          global.client.handleReply.push({
            name: "tu",
            messageID: info.messageID,
            author: userID,
            type: "craft_confirm",
            data: { recipe, quantity }
          });
        }
      });
    }
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  // Xử lý reply cho xác nhận luyện đan
  if (handleReply.type === "craft_confirm") {
    const confirmChoice = parseInt(choice);
    const { recipe, quantity } = handleReply.data;
    
    if (confirmChoice === 1) {
      // Luyện đan với số lượng
      let successCount = 0;
      let failCount = 0;
      const results = [];
      
      for (let i = 0; i < quantity; i++) {
        // Kiểm tra lại điều kiện trước mỗi lần luyện
        const canCraft = canCraftPotion(player, recipe);
        if (!canCraft.canCraft) {
          break; // Dừng nếu không đủ điều kiện
        }
        
        const result = craftPotion(player, recipe);
        if (result.success) {
          successCount++;
          results.push(`✅ Lần ${i + 1}: Thành công`);
        } else {
          failCount++;
          results.push(`❌ Lần ${i + 1}: Thất bại`);
        }
      }
      
      savePlayer(userID, player);
      
      if (successCount > 0 || failCount > 0) {
        const gradeIcon = getGradeIcon(recipe.grade);
        let resultMsg = `🧪 KẾT QUẢ LUYỆN ĐAN:\n\n`;
        resultMsg += `${gradeIcon} ${recipe.name}\n`;
        resultMsg += `📊 Tổng quan:\n`;
        resultMsg += `   ✅ Thành công: ${successCount}/${quantity} (${Math.round(successCount/quantity*100)}%)\n`;
        resultMsg += `   ❌ Thất bại: ${failCount}/${quantity} (${Math.round(failCount/quantity*100)}%)\n\n`;
        
        if (successCount > 0) {
          resultMsg += `🎉 Nhận được ${successCount} viên ${recipe.name}!\n`;
        }
        if (failCount > 0) {
          resultMsg += `💔 ${failCount} lần luyện đan thất bại\n`;
        }
        
        resultMsg += `\n💎 Linh thạch còn lại: ${player.spiritStones.toLocaleString()}\n`;
        resultMsg += `📦 Đan dược đã được thêm vào kho đồ!\n\n`;
        resultMsg += `💡 Dùng lệnh .tu 3 để xem kho đồ và sử dụng đan dược`;
        
        return api.sendMessage(resultMsg, event.threadID, event.messageID);
      } else {
        return api.sendMessage(`❌ Không thể luyện đan! Vui lòng kiểm tra lại điều kiện.`, event.threadID, event.messageID);
      }
    } else if (confirmChoice === 2) {
      return api.sendMessage(`❌ Đã hủy bỏ luyện đan.`, event.threadID, event.messageID);
    }
    
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  

  // Xử lý reply cho kho đồ mới
  if (handleReply.type === "inventory_new") {
    const itemIndex = parseInt(choice) - 1;
    if (itemIndex >= 0 && itemIndex < handleReply.data.length) {
      const selectedGroup = handleReply.data[itemIndex];
      const { item, count } = selectedGroup;

      if (item.type === "đan dược") {
        // Sử dụng đan dược
        const inventoryIndex = player.inventory.findIndex(invItem => 
          invItem.name === item.name && invItem.type === "đan dược"
        );
        if (inventoryIndex !== -1) {
          player.inventory.splice(inventoryIndex, 1);
          applyPotionEffects(player, item);
          savePlayer(userID, player);

          let msg = `✅ Đã sử dụng ${item.name}!\n💊 ${item.description}\n`;
          if (count > 1) msg += `📦 Còn lại: ${count - 1} viên\n`;
          return api.sendMessage(msg, event.threadID, event.messageID);
        }
      } else {
        // Bán vật phẩm khác
        let sellText = `💰 Bán ${item.name}:\n\n`;
        sellText += `1. Bán 1 cái - 💎${item.sellPrice}\n`;
        if (count > 1) {
          sellText += `2. Bán tất cả (${count} cái) - 💎${item.sellPrice * count}\n`;
        }
        sellText += `\n💡 Reply số thứ tự để bán`;

        return api.sendMessage(sellText, event.threadID, (error, info) => {
          if (!error) {
            global.client.handleReply.push({
              name: "tu",
              messageID: info.messageID,
              author: userID,
              type: "sell_item_new",
              data: selectedGroup
            });
          }
        });
      }
    }
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  // Xử lý reply cho bán vật phẩm mới
  if (handleReply.type === "sell_item_new") {
    const sellChoice = parseInt(choice);
    const { item, count } = handleReply.data;
    let sellQuantity = 0;

    switch (sellChoice) {
      case 1: sellQuantity = 1; break;
      case 2: sellQuantity = count; break;
      default: return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
    }

    // Xóa vật phẩm khỏi inventory
    let removed = 0;
    for (let i = player.inventory.length - 1; i >= 0 && removed < sellQuantity; i--) {
      if (player.inventory[i].name === item.name && player.inventory[i].type === item.type) {
        player.inventory.splice(i, 1);
        removed++;
      }
    }

    const totalEarned = item.sellPrice * sellQuantity;
    player.spiritStones += totalEarned;
    savePlayer(userID, player);

    const gradeIcon = getGradeIcon(item.grade);
    return api.sendMessage(`💰 Đã bán ${sellQuantity} ${gradeIcon} ${item.name} được ${totalEarned} linh thạch!\n💎 Linh thạch hiện tại: ${player.spiritStones}`, event.threadID, event.messageID);
  }

  // Xử lý reply cho trang bị vũ khí
  if (handleReply.type === "equip_weapon") {
    const weaponIndex = parseInt(choice) - 1;
    if (weaponIndex >= 0 && weaponIndex < handleReply.data.length) {
      const selectedWeaponGroup = handleReply.data[weaponIndex];
      const selectedWeapon = selectedWeaponGroup.weapon;
      
      // Kiểm tra xem có phải vũ khí đang sử dụng không
      const currentWeapons = player.inventory.filter(item => item.type === "vũ khí");
      const currentBestWeapon = currentWeapons.reduce((best, weapon) => 
        (weapon.attack || 0) > (best.attack || 0) ? weapon : best
      );
      
      if (selectedWeapon.name === currentBestWeapon.name && selectedWeapon.grade === currentBestWeapon.grade) {
        return api.sendMessage("⚔️ Bạn đã đang trang bị vũ khí này rồi!", event.threadID, event.messageID);
      }
      
      // Thông báo trang bị thành công (vũ khí sẽ tự động được sử dụng dựa trên sát thương cao nhất)
      const gradeIcon = getGradeIcon(selectedWeapon.grade);
      const rarityIcon = getRarityIcon(selectedWeapon.rarity);
      let equipMsg = `✅ Đã chọn trang bị ${gradeIcon}${rarityIcon} ${selectedWeapon.name}!\n`;
      equipMsg += `💥 Sát thương: ${selectedWeapon.attack}\n`;
      
      if (selectedWeapon.attack > currentBestWeapon.attack) {
        equipMsg += `📈 Sát thương tăng từ ${currentBestWeapon.attack} lên ${selectedWeapon.attack}!\n`;
      } else if (selectedWeapon.attack < currentBestWeapon.attack) {
        equipMsg += `⚠️ Lưu ý: Vũ khí có sát thương cao nhất (${currentBestWeapon.name} - ${currentBestWeapon.attack}) vẫn sẽ được ưu tiên sử dụng\n`;
      }
      
      equipMsg += `📊 Tổng sát thương hiện tại: ${getPlayerAttack(player)}`;
      savePlayer(userID, player);
      return api.sendMessage(equipMsg, event.threadID, event.messageID);
    }
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  // Xử lý reply cho kho đồ đã gộp
  if (handleReply.type === "inventory_action_grouped") {
    // Kiểm tra nếu người dùng nhập nhiều số (ví dụ: "1 2 3", "1-3", hoặc "1 3" cho số lượng)
    const choiceStr = choice.trim();
    const isMultipleChoice = choiceStr.includes(' ') || choiceStr.includes('-');
    
    if (isMultipleChoice) {
      // Xử lý sử dụng nhiều đồ cùng lúc
      let indices = [];
      
      if (choiceStr.includes('-')) {
        // Xử lý cú pháp "1-3" (từ 1 đến 3)
        const rangeParts = choiceStr.split('-');
        if (rangeParts.length === 2) {
          const start = parseInt(rangeParts[0].trim());
          const end = parseInt(rangeParts[1].trim());
          
          if (!isNaN(start) && !isNaN(end) && start <= end && start > 0 && end <= handleReply.data.length) {
            for (let i = start; i <= end; i++) {
              indices.push(i - 1);
            }
          } else {
            return api.sendMessage("❌ Cú pháp không hợp lệ! Ví dụ: 1-3 (bán từ vật phẩm 1 đến 3)", event.threadID, event.messageID);
          }
        } else {
          return api.sendMessage("❌ Cú pháp không hợp lệ! Ví dụ: 1-3 (bán từ vật phẩm 1 đến 3)", event.threadID, event.messageID);
        }
      } else {
        // Kiểm tra nếu là format "số_vật_phẩm số_lượng" (ví dụ: "1 3")
        const parts = choiceStr.split(' ').filter(p => p.trim());
        if (parts.length === 2) {
          const itemIndex = parseInt(parts[0]) - 1;
          const quantity = parseInt(parts[1]);
          
          if (!isNaN(itemIndex) && !isNaN(quantity) && 
              itemIndex >= 0 && itemIndex < handleReply.data.length && 
              quantity > 0) {
            
            const selectedGroup = handleReply.data[itemIndex];
            const { item, count } = selectedGroup;
            
            // Chỉ cho phép bán (không phải đan dược)
            if (item.type === "đan dược") {
              return api.sendMessage("❌ Không thể bán đan dược với cú pháp này!\n💡 Sử dụng số thứ tự để dùng đan dược", event.threadID, event.messageID);
            }
            
            if (quantity > count) {
              return api.sendMessage(`❌ Số lượng vượt quá giới hạn!\n📦 Bạn chỉ có ${count} ${item.name}\n💡 Vui lòng nhập số từ 1 đến ${count}`, event.threadID, event.messageID);
            }
            
            // Xóa số lượng vật phẩm khỏi inventory
            let removed = 0;
            for (let i = player.inventory.length - 1; i >= 0 && removed < quantity; i--) {
              if (player.inventory[i].name === item.name && 
                  player.inventory[i].type === item.type && 
                  player.inventory[i].grade === item.grade) {
                player.inventory.splice(i, 1);
                removed++;
              }
            }
            
            const totalEarned = item.sellPrice * quantity;
            player.spiritStones += totalEarned;
            savePlayer(userID, player);
            
            const gradeIcon = getGradeIcon(item.grade);
            const rarityIcon = getRarityIcon(item.rarity);
            let sellMsg = `💰 ĐÃ BÁN THÀNH CÔNG!\n\n`;
            sellMsg += `${gradeIcon}${rarityIcon} ${item.name} x${quantity}\n`;
            sellMsg += `💎 Nhận được: ${totalEarned.toLocaleString()} linh thạch\n`;
            sellMsg += `💰 Linh thạch hiện tại: ${player.spiritStones.toLocaleString()}\n`;
            if (count > quantity) {
              sellMsg += `📦 Còn lại trong kho: ${count - quantity} cái`;
            }
            
            return api.sendMessage(sellMsg, event.threadID, event.messageID);
          } else {
            return api.sendMessage("❌ Cú pháp không hợp lệ!\n💡 Ví dụ: 1 3 (bán 3 vật phẩm loại số 1)", event.threadID, event.messageID);
          }
        } else {
          // Xử lý cú pháp "1 2 3" (các số cách nhau bằng dấu cách)
          indices = parts.map(num => parseInt(num.trim()) - 1).filter(index => !isNaN(index));
        }
      }
      
      if (indices.length === 0) {
        return api.sendMessage("❌ Vui lòng nhập số hợp lệ! Ví dụ: 1 2 3", event.threadID, event.messageID);
      }
      
      // Lọc chỉ đan dược
      const potionIndices = indices.filter(index => {
        if (index >= 0 && index < handleReply.data.length) {
          const selectedGroup = handleReply.data[index];
          return selectedGroup.item.type === "đan dược";
        }
        return false;
      });
      
      // Kiểm tra xem có phải chỉ đan dược không
      const nonPotionIndices = indices.filter(index => {
        if (index >= 0 && index < handleReply.data.length) {
          const selectedGroup = handleReply.data[index];
          return selectedGroup.item.type !== "đan dược";
        }
        return false;
      });
      
      // Nếu có cả đan dược và vật phẩm khác, chỉ xử lý đan dược
      if (potionIndices.length > 0 && nonPotionIndices.length > 0) {
        return api.sendMessage("❌ Không thể trộn lẫn đan dược và vật phẩm khác!\n💡 Sử dụng riêng: đan dược để dùng, vật phẩm khác để bán", event.threadID, event.messageID);
      }
      
      // Nếu chỉ có vật phẩm không phải đan dược, xử lý bán hàng loạt
      if (potionIndices.length === 0 && nonPotionIndices.length > 0) {
        let totalEarned = 0;
        let soldItems = [];
        
        // Bán từng vật phẩm
        for (const index of nonPotionIndices) {
          const selectedGroup = handleReply.data[index];
          const { item, count } = selectedGroup;
          
          // Xóa toàn bộ vật phẩm cùng loại khỏi inventory
          let removed = 0;
          for (let i = player.inventory.length - 1; i >= 0 && removed < count; i--) {
            if (player.inventory[i].name === item.name && 
                player.inventory[i].type === item.type && 
                player.inventory[i].grade === item.grade) {
              player.inventory.splice(i, 1);
              removed++;
            }
          }
          
          const itemEarned = item.sellPrice * removed;
          totalEarned += itemEarned;
          soldItems.push(`${item.name} x${removed}`);
        }
        
        player.spiritStones += totalEarned;
        savePlayer(userID, player);
        
        let sellMsg = `💰 ĐÃ BÁN HÀNG LOẠT THÀNH CÔNG!\n\n`;
        sellMsg += `📦 Đã bán:\n`;
        soldItems.forEach((item, i) => {
          sellMsg += `   ${i + 1}. ${item}\n`;
        });
        sellMsg += `\n💎 Tổng thu được: ${totalEarned.toLocaleString()} linh thạch\n`;
        sellMsg += `💰 Linh thạch hiện tại: ${player.spiritStones.toLocaleString()}\n`;
        sellMsg += `🎉 Đã dọn sạch ${soldItems.length} loại vật phẩm!`;
        
        return api.sendMessage(sellMsg, event.threadID, event.messageID);
      }
      
      if (potionIndices.length === 0) {
        return api.sendMessage("❌ Không có vật phẩm hợp lệ để xử lý!", event.threadID, event.messageID);
      }
      
      let usedPotions = [];
      let totalEffects = {
        healAmount: 0,
        spiritPowerAmount: 0,
        hasExpBoost: false,
        hasImmunity: false,
        hasDaoCoreHeal: false,
        hasInjuryHeal: false
      };

      // Sử dụng từng đan dược
      for (const index of potionIndices) {
        const selectedGroup = handleReply.data[index];
        const { item } = selectedGroup;
        
        const inventoryIndex = player.inventory.findIndex(invItem => 
          invItem.name === item.name && invItem.type === "đan dược" && invItem.grade === item.grade
        );
        
        if (inventoryIndex !== -1) {
          const potion = player.inventory[inventoryIndex];
          player.inventory.splice(inventoryIndex, 1);
          
          // Tính tổng hiệu ứng
          if (potion.healAmount) {
            if (potion.healAmount === 9999) {
              totalEffects.healAmount = 9999;
            } else {
              totalEffects.healAmount += potion.healAmount;
            }
          }
          
          if (potion.spiritPowerAmount) {
            if (potion.spiritPowerAmount === 9999) {
              totalEffects.spiritPowerAmount = 9999;
            } else {
              totalEffects.spiritPowerAmount += potion.spiritPowerAmount;
            }
          }
          
          if (potion.subType === "chữa đạo cơ" || potion.healDaoCore) {
            totalEffects.hasDaoCoreHeal = true;
          }
          
          if (potion.subType === "chữa thương") {
            totalEffects.hasInjuryHeal = true;
          }
          
          if (potion.grade === "linh khí" || potion.grade === "linh bảo" || potion.grade === "tiên khí") {
            totalEffects.hasExpBoost = true;
          }
          
          if (potion.grade === "linh bảo" || potion.grade === "tiên khí") {
            totalEffects.hasImmunity = true;
          }
          
          usedPotions.push(potion.name);
        }
      }

      // Áp dụng hiệu ứng tổng hợp
      if (totalEffects.healAmount > 0) {
        if (totalEffects.healAmount === 9999) {
          player.hp = player.maxHp;
        } else {
          player.hp = Math.min(player.maxHp, player.hp + totalEffects.healAmount);
        }
      }

      if (totalEffects.spiritPowerAmount > 0) {
        if (totalEffects.spiritPowerAmount === 9999) {
          player.spiritPower = player.maxSpiritPower;
        } else {
          player.spiritPower = Math.min(player.maxSpiritPower, player.spiritPower + totalEffects.spiritPowerAmount);
        }
      }

      if (totalEffects.hasDaoCoreHeal) {
        healDaoCore(player);
      }

      if (totalEffects.hasInjuryHeal) {
        healPlayer(player);
      }

      if (totalEffects.hasExpBoost) {
        const now = new Date();
        const expBoostTime = new Date(now);
        expBoostTime.setMinutes(expBoostTime.getMinutes() + 30);
        player.expBoostUntil = expBoostTime.toISOString();
        player.expBoostMultiplier = 1.5;
      }

      if (totalEffects.hasImmunity) {
        const now = new Date();
        const immunityTime = new Date(now);
        immunityTime.setHours(immunityTime.getHours() + 1);
        player.immunityUntil = immunityTime.toISOString();
      }

      savePlayer(userID, player);

      let msg = `✅ Đã sử dụng ${usedPotions.length} đan dược:\n`;
      msg += `💊 ${usedPotions.join(', ')}\n\n`;
      msg += `📊 HIỆU QUẢ TỔNG HỢP:\n`;
      msg += `❤️ Máu: ${player.hp}/${player.maxHp}\n`;
      msg += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
      
      if (totalEffects.hasExpBoost) {
        msg += `⚡ Buff kinh nghiệm: x1.5 (30 phút)\n`;
      }
      if (totalEffects.hasImmunity) {
        msg += `🛡️ Miễn nhiễm bị thương (1 giờ)\n`;
      }
      if (totalEffects.hasDaoCoreHeal) {
        msg += `🩹 Đã chữa lành đạo cơ\n`;
      }
      if (totalEffects.hasInjuryHeal) {
        msg += `🩹 Đã chữa lành thương tích\n`;
      }
      
      return api.sendMessage(msg, event.threadID, event.messageID);
    }
    
    // Xử lý đơn lẻ như cũ
    const itemIndex = parseInt(choice) - 1;
    if (itemIndex >= 0 && itemIndex < handleReply.data.length) {
      const selectedGroup = handleReply.data[itemIndex];
      const { item, count, indices } = selectedGroup;

      if (item.type === "đan dược") {
        // Sử dụng đan dược
        const inventoryIndex = player.inventory.findIndex(invItem => 
          invItem.name === item.name && invItem.type === "đan dược" && invItem.grade === item.grade
        );
        if (inventoryIndex !== -1) {
          player.inventory.splice(inventoryIndex, 1);
          applyPotionEffects(player, item);
          savePlayer(userID, player);

          let msg = `✅ Đã sử dụng ${item.name}!\n💊 ${item.description}\n`;
          if (count > 1) msg += `📦 Còn lại: ${count - 1} viên\n`;
          
          // Hiển thị trạng thái hiện tại
          msg += `❤️ Máu: ${player.hp}/${player.maxHp}\n`;
          msg += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
          if (hasExpBoost(player)) {
            const boostTimeLeft = Math.ceil((new Date(player.expBoostUntil) - new Date()) / 60000);
            msg += `⚡ Buff exp: ${player.expBoostMultiplier}x (${boostTimeLeft} phút)\n`;
          }
          if (hasInjuryImmunity(player)) {
            const immunityTimeLeft = Math.ceil((new Date(player.immunityUntil) - new Date()) / 60000);
            msg += `🛡️ Miễn nhiễm bị thương (${immunityTimeLeft} phút)\n`;
          }
          if (!isPlayerInjured(player)) {
            msg += `🩹 Trạng thái: Khỏe mạnh`;
          }

          return api.sendMessage(msg, event.threadID, event.messageID);
        }
      } else {
        // Bán vật phẩm khác
        let sellText = `💰 BÁN VẬT PHẨM:\n\n`;
        const gradeIcon = getGradeIcon(item.grade);
        const rarityIcon = getRarityIcon(item.rarity);
        const typeIcon = item.type === "vũ khí" ? "⚔️" :
                        item.type === "yêu đan" ? "🔮" : 
                        item.type === "vật liệu" ? "🧰" : 
                        item.type === "ngọc" ? "💎" :
                        item.type === "tinh túy" ? "✨" :
                        item.type === "linh hồn" ? "👻" : "📦";
        
        sellText += `${gradeIcon}${rarityIcon}${typeIcon} ${item.name}`;
        if (count > 1) sellText += ` x${count}`;
        sellText += `\n`;
        
        if (item.type === "vũ khí") {
          sellText += `🗡️ Sát thương: ${item.attack}\n`;
        }
        sellText += `📋 ${item.description || 'Không có mô tả'}\n`;
        sellText += `💎 Giá bán: ${item.sellPrice} linh thạch/cái\n`;
        sellText += `📦 Số lượng có trong kho: ${count}\n\n`;
        
        sellText += `1. Bán 1 cái - 💎${item.sellPrice}\n`;
        if (count > 1) {
          sellText += `2. Bán tất cả (${count} cái) - 💎${item.sellPrice * count}\n`;
          sellText += `3. Nhập số lượng cụ thể\n`;
        }
        sellText += `\n💡 Reply số thứ tự để bán`;

        return api.sendMessage(sellText, event.threadID, (error, info) => {
          if (!error) {
            global.client.handleReply.push({
              name: "tu",
              messageID: info.messageID,
              author: userID,
              type: "sell_item_grouped",
              data: selectedGroup
            });
          }
        });
      }
    }
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  // Xử lý reply cho bán vật phẩm đã gộp
  if (handleReply.type === "sell_item_grouped") {
    const sellChoice = parseInt(choice);
    const { item, count, indices } = handleReply.data;
    let sellQuantity = 0;

    switch (sellChoice) {
      case 1: sellQuantity = 1; break;
      case 2: sellQuantity = count; break;
      case 3: 
        if (count > 1) {
          // Yêu cầu nhập số lượng cụ thể
          let inputText = `📝 NHẬP SỐ LƯỢNG MUỐN BÁN:\n\n`;
          inputText += `${getGradeIcon(item.grade)}${getRarityIcon(item.rarity)} ${item.name}\n`;
          inputText += `📦 Số lượng hiện có: ${count}\n`;
          inputText += `💎 Giá bán: ${item.sellPrice.toLocaleString()} linh thạch/cái\n\n`;
          inputText += `💡 Nhập số lượng muốn bán (1-${count}):\n`;
          inputText += `Ví dụ: 13, 345, hay bất kỳ số nào bạn muốn`;
          
          return api.sendMessage(inputText, event.threadID, (error, info) => {
            if (!error) {
              global.client.handleReply.push({
                name: "tu",
                messageID: info.messageID,
                author: userID,
                type: "sell_custom_quantity",
                data: { item, count, indices }
              });
            }
          });
        } else {
          return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
        }
        break;
      default: return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
    }

    // Xóa vật phẩm khỏi inventory (từ cuối lên để không ảnh hưởng index)
    let removed = 0;
    for (let i = player.inventory.length - 1; i >= 0 && removed < sellQuantity; i--) {
      if (player.inventory[i].name === item.name && 
          player.inventory[i].type === item.type && 
          player.inventory[i].grade === item.grade) {
        player.inventory.splice(i, 1);
        removed++;
      }
    }

    const totalEarned = item.sellPrice * sellQuantity;
    player.spiritStones += totalEarned;
    savePlayer(userID, player);

    const gradeIcon = getGradeIcon(item.grade);
    const rarityIcon = getRarityIcon(item.rarity);
    let sellMsg = `💰 ĐÃ BÁN THÀNH CÔNG!\n\n`;
    sellMsg += `${gradeIcon}${rarityIcon} ${item.name} x${sellQuantity}\n`;
    sellMsg += `💎 Nhận được: ${totalEarned.toLocaleString()} linh thạch\n`;
    sellMsg += `💰 Linh thạch hiện tại: ${player.spiritStones.toLocaleString()}\n`;
    if (count > sellQuantity) {
      sellMsg += `📦 Còn lại trong kho: ${count - sellQuantity} cái`;
    }
    
    return api.sendMessage(sellMsg, event.threadID, event.messageID);
  }

  // Xử lý reply cho nhập số lượng tùy chỉnh khi bán
  if (handleReply.type === "sell_custom_quantity") {
    const inputQuantity = parseInt(choice.trim());
    const { item, count, indices } = handleReply.data;
    
    if (isNaN(inputQuantity) || inputQuantity <= 0) {
      return api.sendMessage("❌ Vui lòng nhập số lượng hợp lệ!\nVí dụ: 13, 345", event.threadID, event.messageID);
    }
    
    if (inputQuantity > count) {
      return api.sendMessage(`❌ Số lượng vượt quá giới hạn!\n📦 Bạn chỉ có ${count} cái trong kho\n💡 Vui lòng nhập số từ 1 đến ${count}`, event.threadID, event.messageID);
    }
    
    // Xóa vật phẩm khỏi inventory (từ cuối lên để không ảnh hưởng index)
    let removed = 0;
    for (let i = player.inventory.length - 1; i >= 0 && removed < inputQuantity; i--) {
      if (player.inventory[i].name === item.name && 
          player.inventory[i].type === item.type && 
          player.inventory[i].grade === item.grade) {
        player.inventory.splice(i, 1);
        removed++;
      }
    }

    const totalEarned = item.sellPrice * inputQuantity;
    player.spiritStones += totalEarned;
    savePlayer(userID, player);

    const gradeIcon = getGradeIcon(item.grade);
    const rarityIcon = getRarityIcon(item.rarity);
    let sellMsg = `💰 ĐÃ BÁN THÀNH CÔNG!\n\n`;
    sellMsg += `${gradeIcon}${rarityIcon} ${item.name} x${inputQuantity}\n`;
    sellMsg += `💎 Nhận được: ${totalEarned.toLocaleString()} linh thạch\n`;
    sellMsg += `💰 Linh thạch hiện tại: ${player.spiritStones.toLocaleString()}\n`;
    if (count > inputQuantity) {
      sellMsg += `📦 Còn lại trong kho: ${count - inputQuantity} cái`;
    }
    
    return api.sendMessage(sellMsg, event.threadID, event.messageID);
  }

  // Xử lý reply cho menu tu luyện
  if (handleReply.type === "cultivation_menu") {
    const cultivationChoice = parseInt(choice);
    const { recommendedCost } = handleReply.data;
    let amount = 0;
    
    switch (cultivationChoice) {
      case 1: amount = 100; break;
      case 2: amount = 500; break;
      case 3: amount = 1000; break;
      case 4: amount = recommendedCost; break;
      case 5:
        return api.sendMessage(`🧘 Nhập số linh thạch muốn tu luyện:\n💡 Ví dụ: 2000\n💎 Linh thạch hiện có: ${player.spiritStones.toLocaleString()}`, event.threadID, (error, info) => {
          if (!error) {
            global.client.handleReply.push({
              name: "tu",
              messageID: info.messageID,
              author: userID,
              type: "cultivation_input"
            });
          }
        });
      default:
        return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
    }
    
    const result = cultivateWithSpiritStones(player, amount);
    
    if (!result.success) {
      let errorMsg = `❌ TU LUYỆN THẤT BẠI!\n\n`;
      errorMsg += `📝 Lý do: ${result.reason}\n`;
      
      if (result.reason.includes("Không đủ linh thạch")) {
        errorMsg += `💎 Linh thạch hiện có: ${player.spiritStones.toLocaleString()}\n`;
        errorMsg += `💎 Cần: ${amount.toLocaleString()}\n`;
        errorMsg += `💎 Thiếu: ${(amount - player.spiritStones).toLocaleString()}`;
      }
      
      return api.sendMessage(errorMsg, event.threadID, event.messageID);
    }
    
    savePlayer(userID, player);
    
    let successMsg = `✅ TU LUYỆN THÀNH CÔNG!\n\n`;
    successMsg += `💎 Đã sử dụng: ${amount.toLocaleString()} linh thạch\n`;
    successMsg += `⚡ Kinh nghiệm nhận được: ${result.finalExp.toLocaleString()}`;
    
    if (result.spiritRootBonus) {
      successMsg += ` (Bonus linh căn x${player.spiritRoot.multiplier})`;
    }
    successMsg += `\n`;
    
    if (result.levelUp) {
      successMsg += `🎉 LEVEL UP! Lên cảnh giới ${getLevelName(result.newLevel)}!\n`;
    }
    
    successMsg += `\n📊 TRẠNG THÁI SAU TU LUYỆN:\n`;
    successMsg += `🏆 Cảnh giới: ${getDisplayLevelName(player)}\n`;
    successMsg += `⚡ Kinh nghiệm: ${player.exp}/${getExpToLevel(player.level)}\n`;
    successMsg += `💎 Linh thạch còn lại: ${player.spiritStones.toLocaleString()}\n`;
    
    if (isReadyForTribulation(player)) {
      successMsg += `⚡ Đã sẵn sàng độ kiếp!`;
    }
    
    return api.sendMessage(successMsg, event.threadID, event.messageID);
  }
  
  // Xử lý reply cho nhập số linh thạch tu luyện
  if (handleReply.type === "cultivation_input") {
    const amount = parseInt(choice.trim());
    
    if (isNaN(amount) || amount <= 0) {
      return api.sendMessage("❌ Vui lòng nhập số linh thạch hợp lệ!\nVí dụ: 1000", event.threadID, event.messageID);
    }
    
    const result = cultivateWithSpiritStones(player, amount);
    
    if (!result.success) {
      let errorMsg = `❌ TU LUYỆN THẤT BẠI!\n\n`;
      errorMsg += `📝 Lý do: ${result.reason}\n`;
      
      if (result.reason.includes("Không đủ linh thạch")) {
        errorMsg += `💎 Linh thạch hiện có: ${player.spiritStones.toLocaleString()}\n`;
        errorMsg += `💎 Cần: ${amount.toLocaleString()}\n`;
        errorMsg += `💎 Thiếu: ${(amount - player.spiritStones).toLocaleString()}`;
      }
      
      return api.sendMessage(errorMsg, event.threadID, event.messageID);
    }
    
    savePlayer(userID, player);
    
    let successMsg = `✅ TU LUYỆN THÀNH CÔNG!\n\n`;
    successMsg += `💎 Đã sử dụng: ${amount.toLocaleString()} linh thạch\n`;
    successMsg += `⚡ Kinh nghiệm nhận được: ${result.finalExp.toLocaleString()}`;
    
    if (result.spiritRootBonus) {
      successMsg += ` (Bonus linh căn x${player.spiritRoot.multiplier})`;
    }
    successMsg += `\n`;
    
    if (result.levelUp) {
      successMsg += `🎉 LEVEL UP! Lên cảnh giới ${getLevelName(result.newLevel)}!\n`;
    }
    
    successMsg += `\n📊 TRẠNG THÁI SAU TU LUYỆN:\n`;
    successMsg += `🏆 Cảnh giới: ${getDisplayLevelName(player)}\n`;
    successMsg += `⚡ Kinh nghiệm: ${player.exp}/${getExpToLevel(player.level)}\n`;
    successMsg += `💎 Linh thạch còn lại: ${player.spiritStones.toLocaleString()}\n`;
    
    if (isReadyForTribulation(player)) {
      successMsg += `⚡ Đã sẵn sàng độ kiếp!`;
    }
    
    return api.sendMessage(successMsg, event.threadID, event.messageID);
  }

  // Xử lý reply cho xác nhận độ kiếp
  if (handleReply.type === "tribulation_confirm") {
    const confirmChoice = parseInt(choice);
    
    if (confirmChoice === 1) {
      // Bắt đầu độ kiếp
      if (isDaoCoreInjured(player)) {
        return api.sendMessage(`💀 Đạo cơ đang bị thương! Không thể độ kiếp.`, event.threadID, event.messageID);
      }
      
      if (!isReadyForTribulation(player)) {
        return api.sendMessage(`❌ Không đủ điều kiện độ kiếp!`, event.threadID, event.messageID);
      }
      
      const result = attemptTribulation(player);
      savePlayer(userID, player);
      
      let resultMessage = result.message + `\n\n📊 TRẠNG THÁI SAU ĐỘ KIẾP:\n`;
      resultMessage += `🏆 Cảnh giới: ${getDisplayLevelName(player)}\n`;
      resultMessage += `⚡ Kinh nghiệm: ${player.exp.toLocaleString()}/${getExpToLevel(player.level).toLocaleString()}\n`;
      resultMessage += `❤️ Máu: ${player.hp}/${player.maxHp}\n`;
      resultMessage += `💫 Linh lực: ${player.spiritPower}/${player.maxSpiritPower}\n`;
      if (isDaoCoreInjured(player)) {
        const timeLeft = getDaoCoreInjuryTimeLeft(player);
        resultMessage += `💀 Đạo cơ: Bị thương (${timeLeft} phút)\n`;
      }
      resultMessage += `\n🕐 ${formatTime(new Date())}`;
      
      return api.sendMessage(resultMessage, event.threadID, event.messageID);
    } else if (confirmChoice === 2) {
      return api.sendMessage(`❌ Đã hủy bỏ độ kiếp. Tu luyện cẩn thận!`, event.threadID, event.messageID);
    }
    
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  // Xử lý reply cho menu nâng cấp vũ khí
  if (handleReply.type === "weapon_upgrade_menu") {
    const weaponIndex = parseInt(choice) - 1;
    if (weaponIndex >= 0 && weaponIndex < handleReply.data.length) {
      const weapon = handleReply.data[weaponIndex];
      const level = weapon.level || 0;
      
      if (level >= 10) {
        return api.sendMessage(`⚔️ ${weapon.name} đã đạt cấp tối đa (10)!`, event.threadID, event.messageID);
      }
      
      const upgradeCosts = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200];
      const successRates = [80, 75, 70, 65, 60, 50, 40, 30, 20, 10];
      const requiredCost = upgradeCosts[level];
      const successRate = successRates[level];
      
      let upgradeText = `🔥 LUYỆN KHÍ VŨ KHÍ:\n\n`;
      const gradeIcon = getGradeIcon(weapon.grade);
      upgradeText += `⚔️ Vũ khí: ${gradeIcon} ${weapon.name}\n`;
      upgradeText += `📊 Level hiện tại: ${level}/10\n`;
      upgradeText += `💥 Sát thương hiện tại: ${weapon.attack}\n`;
      upgradeText += `💥 Sát thương sau nâng cấp: ${Math.floor(weapon.attack * 1.15)}\n\n`;
      upgradeText += `💎 Chi phí: ${requiredCost.toLocaleString()} linh thạch\n`;
      upgradeText += `🎯 Tỷ lệ thành công: ${successRate}%\n`;
      upgradeText += `💰 Linh thạch hiện có: ${player.spiritStones.toLocaleString()}\n\n`;
      
      if (player.spiritStones < requiredCost) {
        upgradeText += `❌ Không đủ linh thạch để nâng cấp!\n`;
        upgradeText += `💎 Còn thiếu: ${(requiredCost - player.spiritStones).toLocaleString()} linh thạch`;
      } else {
        upgradeText += `1. 🔥 Bắt đầu luyện khí\n`;
        upgradeText += `2. ❌ Hủy bỏ\n\n`;
        upgradeText += `⚠️ Lưu ý: Thất bại sẽ mất linh thạch nhưng không mất vũ khí`;
      }
      
      return api.sendMessage(upgradeText, event.threadID, (error, info) => {
        if (!error && player.spiritStones >= requiredCost) {
          global.client.handleReply.push({
            name: "tu",
            messageID: info.messageID,
            author: userID,
            type: "weapon_upgrade_confirm",
            data: { weaponIndex, requiredCost }
          });
        }
      });
    }
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  // Xử lý reply cho xác nhận nâng cấp vũ khí
  if (handleReply.type === "weapon_upgrade_confirm") {
    const confirmChoice = parseInt(choice);
    const { weaponIndex, requiredCost } = handleReply.data;
    
    if (confirmChoice === 1) {
      const result = upgradeWeapon(player, weaponIndex, requiredCost);
      
      if (!result.success) {
        let errorMsg = `❌ LUYỆN KHÍ THẤT BẠI!\n\n`;
        errorMsg += `📝 Lý do: ${result.reason}\n`;
        
        if (result.failed) {
          errorMsg += `💔 Đã mất ${result.lostSpiritStones} linh thạch do thất bại\n`;
          errorMsg += `💎 Linh thạch còn lại: ${player.spiritStones.toLocaleString()}\n`;
          errorMsg += `💡 Hãy thử lại với may mắn hơn!`;
        }
        
        savePlayer(userID, player);
        return api.sendMessage(errorMsg, event.threadID, event.messageID);
      }
      
      savePlayer(userID, player);
      
      let successMsg = `🔥 LUYỆN KHÍ THÀNH CÔNG!\n\n`;
      successMsg += `⚔️ Vũ khí: ${result.weaponName}\n`;
      successMsg += `📈 Level: ${result.newLevel - 1} → ${result.newLevel}\n`;
      successMsg += `💥 Sát thương: ${result.oldAttack} → ${result.newAttack}\n`;
      successMsg += `💎 Đã sử dụng: ${requiredCost.toLocaleString()} linh thạch\n`;
      successMsg += `💰 Linh thạch còn lại: ${player.spiritStones.toLocaleString()}\n\n`;
      successMsg += `🎉 Vũ khí của bạn đã mạnh hơn!`;
      
      return api.sendMessage(successMsg, event.threadID, event.messageID);
    } else if (confirmChoice === 2) {
      return api.sendMessage(`❌ Đã hủy bỏ luyện khí.`, event.threadID, event.messageID);
    }
    
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  // Xử lý reply cho kho đồ mới với tùy chọn sử dụng/bán
  if (handleReply.type === "inventory_action_new") {
    const itemIndex = parseInt(choice) - 1;
    if (itemIndex >= 0 && itemIndex < handleReply.data.length) {
      const selectedGroup = handleReply.data[itemIndex];
      const { item, count } = selectedGroup;

      if (item.type === "đan dược") {
        // Sử dụng đan dược
        const inventoryIndex = player.inventory.findIndex(invItem => 
          invItem.name === item.name && invItem.type === "đan dược"
        );
        if (inventoryIndex !== -1) {
          player.inventory.splice(inventoryIndex, 1);
          applyPotionEffects(player, item);
          savePlayer(userID, player);

          let msg = `✅ Đã sử dụng ${item.name}!\n💊 ${item.description}\n`;
          if (count > 1) msg += `📦 Còn lại: ${count - 1} viên\n`;
          
          // Hiển thị trạng thái hiện tại
          msg += `❤️ Máu: ${player.hp}/${player.maxHp}\n`;
          if (hasExpBoost(player)) {
            const boostTimeLeft = Math.ceil((new Date(player.expBoostUntil) - new Date()) / 60000);
            msg += `⚡ Buff exp: ${player.expBoostMultiplier}x (${boostTimeLeft} phút)\n`;
          }
          if (hasInjuryImmunity(player)) {
            const immunityTimeLeft = Math.ceil((new Date(player.immunityUntil) - new Date()) / 60000);
            msg += `🛡️ Miễn nhiễm bị thương (${immunityTimeLeft} phút)\n`;
          }
          if (!isPlayerInjured(player)) {
            msg += `🩹 Trạng thái: Khỏe mạnh`;
          }

          return api.sendMessage(msg, event.threadID, event.messageID);
        }
      } else {
        // Bán vật phẩm khác
        let sellText = `💰 Bán ${item.name}:\n\n`;
        const gradeIcon = getGradeIcon(item.grade);
        const typeIcon = item.type === "vũ khí" ? "⚔️" :
                        item.type === "yêu đan" ? "🔮" : 
                        item.type === "vật liệu" ? "🧰" : 
                        item.type === "ngọc" ? "💎" :
                        item.type === "tinh túy" ? "✨" :
                        item.type === "linh hồn" ? "👻" : "📦";
        
        sellText += `${gradeIcon}${typeIcon} ${item.name}\n`;
        if (item.type === "vũ khí") {
          sellText += `🗡️ Sát thương: ${item.attack}\n`;
        }
        sellText += `💎 Giá bán: ${item.sellPrice} linh thạch/cái\n\n`;
        sellText += `1. Bán 1 cái - 💎${item.sellPrice}\n`;
        if (count > 1) {
          sellText += `2. Bán tất cả (${count} cái) - 💎${item.sellPrice * count}\n`;
        }
        sellText += `\n💡 Reply số thứ tự để bán`;

        return api.sendMessage(sellText, event.threadID, (error, info) => {
          if (!error) {
            global.client.handleReply.push({
              name: "tu",
              messageID: info.messageID,
              author: userID,
              type: "sell_item_new",
              data: selectedGroup
            });
          }
        });
      }
    }
    return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
  }

  // Xử lý reply cho kho đồ
  if (handleReply.type === "inventory_category") {
    const categoryIndex = parseInt(choice);
    let inventoryText = "";

    if (categoryIndex >= 1 && categoryIndex <= 5) {
      const gradeName = getGradeName(categoryIndex);
      const gradeIcon = getGradeIcon(gradeName);
      const gradeItems = player.inventory.filter(eq => eq.grade === gradeName);

      inventoryText = `📦 Kho đồ - ${gradeIcon} ${gradeName.toUpperCase()}:\n\n`;
      if (gradeItems.length > 0) {
        const groupedItems = {};
        gradeItems.forEach(item => {
          groupedItems[item.name] = (groupedItems[item.name] || 0) + 1;
        });
        Object.entries(groupedItems).forEach(([name, count]) => {
          const item = gradeItems.find(i => i.name === name);
          inventoryText += `• ${name} x${count} - 💎${item.sellPrice} mỗi cái\n`;
        });
      } else {
        inventoryText += `Chưa có trang bị nào trong danh mục này!`;
      }
    } else if (categoryIndex === 6) {
      inventoryText = "📦 Kho đồ - TẤT CẢ:\n\n";
      const groupedItems = {};
      player.inventory.forEach(item => {
        groupedItems[item.name] = (groupedItems[item.name] || 0) + 1;
      });
      Object.entries(groupedItems).forEach(([name, count]) => {
        const item = player.inventory.find(i => i.name === name);
        const gradeIcon = getGradeIcon(item.grade);
        inventoryText += `• ${gradeIcon} ${name} x${count} - 💎${item.sellPrice} mỗi cái\n`;
      });
    } else {
      return api.sendMessage("❓ Lựa chọn không hợp lệ!", event.threadID, event.messageID);
    }

    return api.sendMessage(inventoryText, event.threadID, event.messageID);
  }
};