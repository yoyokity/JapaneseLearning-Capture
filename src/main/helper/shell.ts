import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'

import { execSync, spawn } from 'node:child_process'

interface ExitCallback {
    (code: number, stdout: string, stderr: string): void
}

interface LineCallback {
    (data: string): void
}

class CmdHandle {
    private child: ChildProcess
    private _dataOutput = ''
    private _errorOutput = ''
    private _onOutput: LineCallback | null = null
    private _onError: LineCallback | null = null
    private _onExit: ExitCallback | null = null

    constructor(child: ChildProcess) {
        this.child = child

        this.child.stdout?.on('data', (chunk: Buffer) => {
            this._dataOutput += chunk
            if (this._onOutput) {
                this._onOutput(chunk.toString())
            }
        })
        this.child.stderr?.on('data', (chunk: Buffer) => {
            this._errorOutput += chunk
            if (this._onError) {
                this._onError(chunk.toString())
            }
        })

        this.child.on('close', (code: number) => {
            if (this._onExit) {
                this._onExit(code, this._dataOutput, this._errorOutput)
            }
        })
    }

    /**
     * 设置标准输出行回调函数
     * @param func 回调函数，参数为输出的行文本
     */
    onOutputLine(func: LineCallback): void {
        this._onOutput = func
    }

    /**
     * 当程序退出时执行
     * @param func 参数依次为 退出代码，文本输出，错误输出
     */
    onExit(func: ExitCallback): void {
        this._onExit = func
    }

    /**
     * 设置错误输出行回调函数
     * @param func 回调函数，参数为错误输出的行文本
     */
    onErrorLine(func: LineCallback): void {
        this._onError = func
    }
}

/**
 * Cmd类，传入要执行的程序的绝对路径
 */
export class Cmd {
    path: string

    constructor(path_: string) {
        this.path = path_
    }

    /**
     * 异步运行，路径参数不要加双引号！
     * @param args 命令行参数数组
     * @returns 返回一个控制句柄，可添加事件监听
     */
    run(args: string[]): CmdHandle {
        console.log('cmd ', `${this.path} ${args.join(' ')}`)

        const child = spawn(this.path, args)
        return new CmdHandle(child)
    }

    /**
     * 同步运行，路径参数请加上双引号，以免因空格参数识别错误
     * @param args 命令行参数数组
     * @returns 返回程序全部输出文本
     */
    runSync(args: string[]): string {
        console.log('cmd ', `${this.path} ${args.join(' ')}`)
        return execSync(`"${this.path}" ${args.join(' ')}`, { encoding: 'utf-8' })
    }
}
