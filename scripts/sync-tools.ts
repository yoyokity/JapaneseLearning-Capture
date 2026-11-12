import { cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 项目根目录
const root = fileURLToPath(new URL('..', import.meta.url))

// 重建 tools 目录
rmSync(join(root, 'tools', 'image-polish'), { recursive: true, force: true })
cpSync(join(root, 'image-polish', 'out'), join(root, 'tools', 'image-polish'), { recursive: true })
