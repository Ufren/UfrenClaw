#!/usr/bin/env node
import { spawn } from 'node:child_process'

let flavorArg = (process.argv[2] || '').toLowerCase()
// 容错：用户可能输入 vulcan（常见拼写），统一映射为 vulkan
if (flavorArg === 'vulcan') flavorArg = 'vulkan'
const valid = new Set(['cpu', 'vulkan', 'cuda'])
const flavor = valid.has(flavorArg) ? flavorArg : ''

const env = { ...process.env }
if (flavor) {
  env.LLAMA_FLAVOR = flavor
  console.log(`[compile] Using LLAMA_FLAVOR=${flavor}`)
} else {
  console.log('[compile] No flavor specified, defaulting to LLAMA_FLAVOR=cpu')
  env.LLAMA_FLAVOR = 'cpu'
}

const command = process.platform === 'win32' ? 'npm run compile:base' : 'npm run compile:base'
const child = spawn(command, {
  stdio: 'inherit',
  env,
  shell: true
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})


