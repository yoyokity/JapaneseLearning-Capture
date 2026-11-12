import { copyFileSync } from 'node:fs'

// 同步主图标到渲染层
copyFileSync('resources/mainIcon.png', 'src/renderer/src/assets/app-icon.png')
