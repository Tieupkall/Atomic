const axios = require('axios');
const tunnel = require('tunnel');

// Import both HTTP and HTTPS proxy agents
let HttpProxyAgent, HttpsProxyAgent;
try {
  const httpProxy = require('http-proxy-agent');
  const httpsProxy = require('https-proxy-agent');
  
  HttpProxyAgent = httpProxy.HttpProxyAgent || httpProxy;
  HttpsProxyAgent = httpsProxy.HttpsProxyAgent || httpsProxy;
  
  console.log('✅ Proxy agents imported successfully');
} catch (error) {
  console.error('❌ Không thể import proxy agents:', error.message);
  console.log('💡 Cài đặt: npm install http-proxy-agent https-proxy-agent tunnel');
  process.exit(1);
}

// THÔNG TIN PROXY CỦA BẠN
const PROXY_CONFIG = {
  host: '160.191.240.138',
  port: 20579,
  username: 'n63',
  password: 'k1027',
  protocol: 'http'
};

// TẠO NHIỀU LOẠI PROXY AGENTS
function createProxyAgents() {
  const proxyUrl = `${PROXY_CONFIG.protocol}://${PROXY_CONFIG.username}:${PROXY_CONFIG.password}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;
  
  try {
    // Method 1: Using http-proxy-agent và https-proxy-agent
    const httpAgent = new HttpProxyAgent(proxyUrl);
    const httpsAgent = new HttpsProxyAgent(proxyUrl);
    
    // Method 2: Using tunnel (alternative approach)
    const tunnelOptions = {
      proxy: {
        host: PROXY_CONFIG.host,
        port: PROXY_CONFIG.port,
        proxyAuth: `${PROXY_CONFIG.username}:${PROXY_CONFIG.password}`
      }
    };
    
    const tunnelHttpAgent = tunnel.httpOverHttp(tunnelOptions);
    const tunnelHttpsAgent = tunnel.httpsOverHttp(tunnelOptions);
    
    return {
      httpAgent,
      httpsAgent,
      tunnelHttpAgent,
      tunnelHttpsAgent,
      proxyUrl
    };
  } catch (error) {
    console.error('❌ Lỗi tạo proxy agents:', error.message);
    return null;
  }
}

// HÀM TEST PROXY VỚI NHIỀU METHODS
async function testProxyConnection() {
  console.log('🚀 Testing proxy connection với nhiều methods...\n');
  
  const agents = createProxyAgents();
  if (!agents) return false;
  
  // Test cases với các endpoints khác nhau
  const testCases = [
    {
      name: 'HTTP endpoint',
      url: 'http://api.ipify.org?format=json',
      agent: agents.httpAgent
    },
    {
      name: 'HTTPS endpoint (method 1)',
      url: 'https://api.ipify.org?format=json',
      agent: agents.httpsAgent
    },
    {
      name: 'HTTPS endpoint (tunnel method)',
      url: 'https://api.ipify.org?format=json',
      agent: agents.tunnelHttpsAgent
    },
    {
      name: 'Facebook check',
      url: 'https://www.facebook.com',
      agent: agents.httpsAgent
    }
  ];
  
  for (const testCase of testCases) {
    try {
      console.log(`🔍 Testing: ${testCase.name}...`);
      
      const testAxios = axios.create({
        httpAgent: testCase.agent,
        httpsAgent: testCase.agent,
        proxy: false,
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        },
        // Thêm options để handle SSL issues
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });
      
      const response = await testAxios.get(testCase.url);
      
      if (testCase.url.includes('ipify')) {
        console.log(`✅ ${testCase.name} - Success! Proxy IP:`, response.data.ip);
      } else {
        console.log(`✅ ${testCase.name} - Success! Status:`, response.status);
      }
      
      return { success: true, agents }; // Return on first success
      
    } catch (error) {
      console.error(`❌ ${testCase.name} - Failed:`, error.message);
      
      // Detailed error analysis
      if (error.code === 'ECONNRESET') {
        console.log('   → Connection reset - proxy server issue');
      } else if (error.code === 'ECONNREFUSED') {
        console.log('   → Connection refused - proxy server down');
      } else if (error.code === 'ETIMEDOUT') {
        console.log('   → Timeout - proxy server slow/unresponsive');
      } else if (error.response?.status === 400) {
        console.log('   → 400 Bad Request - proxy authentication or protocol issue');
      } else if (error.response?.status === 407) {
        console.log('   → 407 Proxy Authentication Required');
      }
    }
  }
  
  return { success: false, agents };
}

// HÀM LOGIN VỚI PROXY (IMPROVED)
function loginWithProxy(loginData, callback) {
  const login = require("./includes/fca");
  
  // Get working proxy agents
  const agents = createProxyAgents();
  if (!agents) {
    return callback(new Error('Không thể tạo proxy agents'), null);
  }
  
  // Patch axios globally cho login process
  const originalAxiosDefaults = { ...axios.defaults };
  
  // Set proxy cho tất cả requests during login
  axios.defaults.httpAgent = agents.httpAgent;
  axios.defaults.httpsAgent = agents.httpsAgent;
  axios.defaults.proxy = false;
  axios.defaults.timeout = 30000;
  axios.defaults.headers.common['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  
  // Override các method của axios
  const originalCreate = axios.create;
  axios.create = function(config = {}) {
    return originalCreate.call(this, {
      ...config,
      httpAgent: agents.httpAgent,
      httpsAgent: agents.httpsAgent,
      proxy: false,
      timeout: config.timeout || 30000
    });
  };
  
  console.log('🚀 Đang đăng nhập Facebook qua proxy...');
  
  // Thực hiện login với timeout
  const loginTimeout = setTimeout(() => {
    restoreAxios();
    callback(new Error('Login timeout qua proxy'), null);
  }, 60000);
  
  function restoreAxios() {
    // Restore axios về trạng thái ban đầu
    Object.assign(axios.defaults, originalAxiosDefaults);
    axios.create = originalCreate;
    clearTimeout(loginTimeout);
  }
  
  try {
    login(loginData, (error, api) => {
      restoreAxios();
      
      if (error) {
        console.error('❌ Lỗi đăng nhập qua proxy:', error.message || error);
        return callback(error, null);
      }
      
      console.log('✅ Đăng nhập Facebook thành công qua proxy!');
      console.log('🔄 Đã chuyển về kết nối trực tiếp cho các hoạt động khác');
      
      callback(null, api);
    });
  } catch (error) {
    restoreAxios();
    callback(error, null);
  }
}

// HÀM TẠO FCA OPTIONS VỚI PROXY
function createFCAOptionsWithProxy() {
  const agents = createProxyAgents();
  if (!agents) return {};
  
  return {
    forceLogin: true,
    logLevel: "silent",
    updatePresence: false,
    selfListen: true,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    
    // Proxy settings
    proxy: agents.proxyUrl,
    
    // Request options
    requestOptions: {
      proxy: false,
      httpAgent: agents.httpAgent,
      httpsAgent: agents.httpsAgent,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }
  };
}

// FUNCTION ĐỂ CHECK PROXY STATUS
async function getProxyStatus() {
  try {
    const result = await testProxyConnection();
    return {
      working: result.success,
      message: result.success ? 'Proxy hoạt động bình thường' : 'Proxy không hoạt động',
      config: PROXY_CONFIG
    };
  } catch (error) {
    return {
      working: false,
      message: `Lỗi kiểm tra proxy: ${error.message}`,
      config: PROXY_CONFIG
    };
  }
}

// EXPORT ALL FUNCTIONS
module.exports = {
  createProxyAgents,
  createFCAOptionsWithProxy,
  loginWithProxy,
  testProxyConnection,
  getProxyStatus,
  PROXY_CONFIG
};