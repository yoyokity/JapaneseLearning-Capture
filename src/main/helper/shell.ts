import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'

import { execSync, spawn } from 'node:child_process'

interface ExitCallback {
    (code: number, stdout: string, stderr: string): void
}

interface LineCallback {
    (data: string): void
}

export class CmdHandle {
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
            this._onOutput?.(chunk.toString())
        })
        this.child.stderr?.on('data', (chunk: Buffer) => {
            this._errorOutput += chunk
            this._onError?.(chunk.toString())
        })

        this.child.on('close', (code: number) => {
            this._onExit?.(code, this._dataOutput, this._errorOutput)
        })
    }

    /** 终止子进程 */
    kill(): boolean {
        return this.child.kill()
    }

    /** 设置输出行回调 */
    onOutputLine(func: LineCallback): void {
        this._onOutput = func
    }

    /** 程序退出时执行 */
    onExit(func: ExitCallback): void {
        this._onExit = func
    }

    /** 设置错误行回调 */
    onErrorLine(func: LineCallback): void {
        this._onError = func
    }
}

export class Cmd {
    path: string

    constructor(path_: string) {
        this.path = path_
    }

    /** 异步运行，路径勿加引号 */
    run(args: string[]): CmdHandle {
        console.log('cmd ', `${this.path} ${args.join(' ')}`)

        const child = spawn(this.path, args)
        return new CmdHandle(child)
    }

    /** 同步运行 */
    runSync(args: string[]): string {
        console.log('cmd ', `${this.path} ${args.join(' ')}`)
        return execSync(`"${this.path}" ${args.join(' ')}`, { encoding: 'utf-8' })
    }
}
