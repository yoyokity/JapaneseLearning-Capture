import { ipcMain } from 'electron'
import './filesystem'

// 测试连通
ipcMain.handle('check', () => true)
