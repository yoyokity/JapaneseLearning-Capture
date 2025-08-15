import { ipcMain } from 'electron'
import './app'
import './filesystem'
import './net'

// 测试连通
ipcMain.handle('check', () => true)

export * from './app'
