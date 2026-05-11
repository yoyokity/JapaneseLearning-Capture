import { LogHelper } from './LogHelper'

/**
 * 数据处理相关，提供数据的存储和读取功能
 */
export class DataHelper {
    /**
     * 默认数据库名称
     */
    private static readonly DB_NAME = 'japanese-learning-capture-db'

    /**
     * 数据库连接实例
     */
    private static _db: IDBDatabase | null = null

    /**
     * 数据库连接状态
     */
    private static _connecting: Promise<IDBDatabase> | null = null

    /**
     * 存储数据到IndexedDB
     * @param name 表名
     * @param key 数据的键
     * @param value 要存储的数据
     * @returns 返回是否存储成功
     */
    static async set(name: string, key: string, value: any): Promise<boolean> {
        try {
            const db = await this.getDBConnection(name)
            const transaction = db.transaction(name, 'readwrite')
            const store = transaction.objectStore(name)

            return new Promise((resolve) => {
                const request = store.put({ key, value })

                request.onsuccess = () => {
                    resolve(true)
                }

                request.onerror = (event) => {
                    LogHelper.error('存储数据失败:', (event.target as IDBRequest).error)
                    resolve(false)
                }
            })
        } catch (error) {
            LogHelper.error('存储数据时发生错误:', error)
            return false
        }
    }

    /**
     * 从IndexedDB获取数据
     * @param name 表名
     * @param key 数据的键
     * @returns 返回获取的数据，如果不存在则返回null
     */
    static async get<T = any>(name: string, key: string): Promise<T | null> {
        try {
            const db = await this.getDBConnection(name)
            const transaction = db.transaction(name, 'readonly')
            const store = transaction.objectStore(name)

            return new Promise((resolve) => {
                const request = store.get(key)

                request.onsuccess = (event) => {
                    const result = (event.target as IDBRequest).result
                    if (result) {
                        resolve(result.value)
                    } else {
                        resolve(null)
                    }
                }

                request.onerror = (event) => {
                    LogHelper.error('获取数据失败:', (event.target as IDBRequest).error)
                    resolve(null)
                }
            })
        } catch (error) {
            LogHelper.error('获取数据时发生错误:', error)
            return null
        }
    }

    /**
     * 初始化数据库连接
     * @description 每次刮削启动时调用此方法建立数据库连接
     * @remarks 编写刮削器的时候不需要调用此方法
     */
    protected static async init(): Promise<void> {
        try {
            this._db = await this.openDB()
            LogHelper.debug('数据库连接已初始化')
        } catch (error) {
            LogHelper.error('初始化数据库连接失败:', error)
        }
    }

    /**
     * 关闭数据库连接
     * @description 每次刮削结束时调用此方法
     * @remarks 编写刮削器的时候不需要调用此方法
     */
    protected static close(): void {
        if (this._db) {
            this._db.close()
            this._db = null
            LogHelper.debug('数据库连接已关闭')
        }
    }

    /**
     * 获取数据库连接
     * 如果连接不存在或已关闭，则自动重新连接
     * @returns 返回数据库连接
     * @private
     */
    private static async getDBConnection(storeName?: string): Promise<IDBDatabase> {
        // 如果正在连接中，等待连接完成
        if (this._connecting) {
            this._db = await this._connecting
        }

        // 如果已有连接且表存在，直接返回
        if (this._db && (!storeName || this._db.objectStoreNames.contains(storeName))) {
            return this._db
        }

        // 如果没有连接，则创建新连接
        if (!this._db) {
            this._connecting = this.openDB(storeName)

            try {
                this._db = await this._connecting
            } finally {
                this._connecting = null
            }
        }

        // 如果表已存在，直接返回
        if (this._db && (!storeName || this._db.objectStoreNames.contains(storeName))) {
            return this._db
        }

        // 如果表不存在，则升级数据库并创建对应的表
        const version = this._db!.version + 1
        this._db?.close()
        this._db = null
        this._connecting = this.openDB(storeName, version)

        try {
            this._db = await this._connecting
            return this._db
        } finally {
            this._connecting = null
        }
    }

    /**
     * 打开IndexedDB数据库
     * @returns 返回打开的数据库连接
     * @private
     */
    private static openDB(storeName?: string, version?: number): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = version
                ? indexedDB.open(this.DB_NAME, version)
                : indexedDB.open(this.DB_NAME)

            request.onerror = (event) => {
                LogHelper.error('打开数据库失败:', (event.target as IDBRequest).error)
                reject((event.target as IDBRequest).error)
            }

            request.onsuccess = (event) => {
                const db = (event.target as IDBOpenDBRequest).result

                // 监听连接关闭事件，清除连接实例
                db.onclose = () => {
                    LogHelper.debug('数据库连接已关闭')
                    if (this._db === db) {
                        this._db = null
                    }
                }

                // 监听连接错误事件
                db.onerror = (event) => {
                    LogHelper.error('数据库连接错误:', event)
                }

                resolve(db)
            }

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result

                // 按表名创建存储对象，使用key作为主键
                if (storeName && !db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: 'key' })
                }
            }
        })
    }
}

/**
 * 不对外暴露的数据操作类
 */
export class _Data extends DataHelper {
    static init(): Promise<void> {
        return super.init()
    }

    static close(): void {
        return super.close()
    }
}
