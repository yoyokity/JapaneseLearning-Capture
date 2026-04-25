import { ipcMain } from 'electron'
import './app'
import './filesystem'
import './net'
import './image'

// 测试连通
ipcMain.handle('check', () => true)

export * from './app'
