/**
 * HuggingFace API 测试脚本
 * 用于调试模型文件查询问题
 */

const https = require('https');

// 测试的仓库
const repos = [
  'Qwen/Qwen3-8B-GGUF',
  'AI-ModelScope/Qwen-1.8B-Chat-GGUF',
  'ggml-org/gemma-3-1b-it-GGUF'
];

/**
 * 发送 HTTP 请求
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 测试单个仓库
 */
async function testRepo(repo) {
  console.log('\n' + '='.repeat(80));
  console.log(`📦 测试仓库: ${repo}`);
  console.log('='.repeat(80));
  
  const apiUrl = `https://huggingface.co/api/models/${repo}`;
  console.log(`🔗 API URL: ${apiUrl}\n`);
  
  try {
    const data = await fetchJson(apiUrl);
    
    console.log('📊 响应结构:');
    console.log(`  - 顶层键: ${Object.keys(data).join(', ')}`);
    console.log(`  - 是否有 siblings: ${Boolean(data.siblings)}`);
    console.log(`  - siblings 类型: ${Array.isArray(data.siblings) ? 'array' : typeof data.siblings}`);
    console.log(`  - siblings 长度: ${data.siblings?.length || 0}`);
    
    if (data.siblings && Array.isArray(data.siblings)) {
      // 查找 .gguf 文件
      const ggufFiles = data.siblings.filter(f => 
        f.rfilename && f.rfilename.toLowerCase().endsWith('.gguf')
      );
      
      console.log(`\n🔍 GGUF 文件数量: ${ggufFiles.length}`);
      
      if (ggufFiles.length > 0) {
        console.log('\n📁 GGUF 文件列表:');
        ggufFiles.forEach((f, i) => {
          const sizeMB = f.size ? (f.size / 1024 / 1024).toFixed(2) : 'N/A';
          console.log(`  ${i + 1}. ${f.rfilename} (${sizeMB} MB)`);
        });
        
        // 查找 Q4_K_M
        const q4Files = ggufFiles.filter(f => 
          f.rfilename.toLowerCase().includes('q4_k_m') ||
          f.rfilename.toLowerCase().includes('q4-k-m')
        );
        
        if (q4Files.length > 0) {
          console.log(`\n✅ 找到 Q4_K_M 量化版本: ${q4Files[0].rfilename}`);
        } else {
          console.log(`\n⚠️ 未找到 Q4_K_M，将使用第一个文件: ${ggufFiles[0].rfilename}`);
        }
      } else {
        console.log('\n❌ 未找到任何 .gguf 文件');
        
        // 显示前 10 个文件作为参考
        console.log('\n📋 仓库中的其他文件（前 10 个）:');
        data.siblings.slice(0, 10).forEach((f, i) => {
          console.log(`  ${i + 1}. ${f.rfilename}`);
        });
      }
    } else {
      console.log('\n❌ 响应中没有 siblings 字段或格式不正确');
      console.log('\n📋 完整响应（前 500 字符）:');
      console.log(JSON.stringify(data, null, 2).substring(0, 500));
    }
    
    console.log('\n✅ 测试完成');
    
  } catch (error) {
    console.error(`\n❌ 错误: ${error.message}`);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 HuggingFace API 测试工具');
  console.log('测试仓库数量:', repos.length);
  
  for (const repo of repos) {
    await testRepo(repo);
    // 等待一下，避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('🎉 所有测试完成！');
  console.log('='.repeat(80));
}

// 运行
main().catch(console.error);

