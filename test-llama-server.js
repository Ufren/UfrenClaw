/**
 * llama-server 诊断测试脚本
 * 用于检查 llama-server 是否能正常运行
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🔍 开始诊断 llama-server...\n');

// 1. 检查文件是否存在
const llamaServerPath = path.join(__dirname, 'buildResources', 'llama.cpp', 'win32-x64', 'llama-server.exe');
console.log('1️⃣ 检查文件路径:', llamaServerPath);

if (!fs.existsSync(llamaServerPath)) {
  console.error('❌ llama-server.exe 不存在！');
  console.log('\n解决方案：');
  console.log('  1. 下载 llama.cpp for Windows');
  console.log('  2. 将 llama-server.exe 及相关 DLL 文件放到：');
  console.log('     buildResources/llama.cpp/win32-x64/');
  process.exit(1);
}

console.log('✅ 文件存在\n');

// 2. 检查目录内容
const llamaDir = path.dirname(llamaServerPath);
console.log('2️⃣ 检查目录内容:', llamaDir);
const files = fs.readdirSync(llamaDir);
console.log('文件列表:');
files.forEach(file => {
  const stats = fs.statSync(path.join(llamaDir, file));
  console.log(`  - ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
});
console.log('');

// 3. 测试基本命令
console.log('3️⃣ 测试 --help 命令...');

const helpProcess = spawn(`"${llamaServerPath}"`, ['--help'], {
  shell: true,
  env: {
    ...process.env,
    PATH: `${llamaDir};${process.env.PATH}`
  }
});

let helpOutput = '';
let helpError = '';

helpProcess.stdout.on('data', (data) => {
  helpOutput += data.toString();
});

helpProcess.stderr.on('data', (data) => {
  helpError += data.toString();
});

helpProcess.on('close', (code) => {
  if (code === 0) {
    console.log('✅ --help 命令执行成功');
    console.log('输出（前200字符）:', helpOutput.substring(0, 200));
  } else {
    console.error('❌ --help 命令失败，退出代码:', code);
    if (helpError) {
      console.error('错误信息:', helpError);
    }
    
    console.log('\n可能的原因：');
    console.log('  1. 缺少依赖 DLL 文件（如 vcruntime140.dll, msvcp140.dll）');
    console.log('  2. 需要安装 Visual C++ Redistributable');
    console.log('  3. 文件损坏或不完整');
    
    console.log('\n解决方案：');
    console.log('  1. 下载并安装 Visual C++ Redistributable:');
    console.log('     https://aka.ms/vs/17/release/vc_redist.x64.exe');
    console.log('  2. 确保所有 DLL 文件都在同一目录下');
    console.log('  3. 重新下载完整的 llama.cpp 发行版');
  }
  
  console.log('\n');
  
  // 4. 测试下载命令（如果 help 成功）
  if (code === 0) {
    console.log('4️⃣ 测试模型下载命令（会实际下载，按 Ctrl+C 取消）...');
    console.log('');
    
    const testModelId = 'ggml-org/gemma-3-1b-it-GGUF';
    const testCacheDir = path.join(__dirname, 'temp-download-test');
    
    // 创建测试目录
    if (!fs.existsSync(testCacheDir)) {
      fs.mkdirSync(testCacheDir, { recursive: true });
    }
    
    const downloadCmd = `"${llamaServerPath}"`;
    const downloadArgs = [
      '-hf',
      testModelId
    ];
    
    console.log('命令:', downloadCmd, downloadArgs.join(' '));
    console.log('缓存目录:', testCacheDir);
    console.log('');
    
    const downloadProcess = spawn(downloadCmd, downloadArgs, {
      shell: true,
      env: {
        ...process.env,
        PATH: `${llamaDir};${process.env.PATH}`,
        HUGGINGFACE_HUB_CACHE: testCacheDir,
        HF_HOME: testCacheDir
      }
    });
    
    let downloadOutput = '';
    
    downloadProcess.stdout.on('data', (data) => {
      const output = data.toString();
      downloadOutput += output;
      process.stdout.write(output);
    });
    
    downloadProcess.stderr.on('data', (data) => {
      const output = data.toString();
      downloadOutput += output;
      process.stderr.write(output);
    });
    
    downloadProcess.on('close', (code) => {
      console.log('\n');
      if (code === 0) {
        console.log('✅ 下载测试成功！');
        console.log('');
        console.log('🎉 llama-server 工作正常！');
        console.log('');
        console.log('清理测试文件...');
        try {
          fs.rmSync(testCacheDir, { recursive: true, force: true });
          console.log('✅ 已清理');
        } catch (e) {
          console.log('⚠️ 请手动删除:', testCacheDir);
        }
      } else {
        console.error('❌ 下载测试失败，退出代码:', code);
        console.log('');
        console.log('📋 完整输出:');
        console.log(downloadOutput);
        console.log('');
        console.log('请将上述信息提供给开发者进行排查。');
      }
    });
    
    // 10秒后自动取消（避免真的下载）
    setTimeout(() => {
      if (!downloadProcess.killed) {
        console.log('\n⏱️ 10秒测试时间到，取消下载...');
        downloadProcess.kill();
        console.log('✅ 如果看到下载开始，说明 llama-server 工作正常！');
        console.log('');
        console.log('清理测试文件...');
        try {
          fs.rmSync(testCacheDir, { recursive: true, force: true });
          console.log('✅ 已清理');
        } catch (e) {
          console.log('⚠️ 请手动删除:', testCacheDir);
        }
      }
    }, 10000);
  }
});

helpProcess.on('error', (error) => {
  console.error('❌ 启动进程失败:', error);
  console.log('\n可能的原因：');
  console.log('  1. 文件权限问题');
  console.log('  2. 被杀毒软件阻止');
  console.log('  3. 文件不是有效的可执行文件');
});

