import { DebugHelper } from './DebugHelper'

/**
 * 数据处理相关，提供数据的存储和读取功能
 */
export class DataHelper {
	/**
	 * 默认数据库名称
	 */
	private static readonly DB_NAME = 'japanese-learning-capture-db'

	/**
	 * 默认数据库版本
	 */
	private static readonly DB_VERSION = 1

	/**
	 * 默认存储对象名称
	 */
	private static readonly STORE_NAME = 'app-data'

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
	 * @param name 刮削器名称
	 * @param key 数据的键
	 * @param value 要存储的数据
	 * @returns 返回是否存储成功
	 */
	static async set(name: string, key: string, value: any): Promise<boolean> {
		try {
			const db = await this.getDBConnection()
			const transaction = db.transaction(this.STORE_NAME, 'readwrite')
			const store = transaction.objectStore(this.STORE_NAME)

			// 使用name:key的组合形式作为存储键
			const compositeKey = `${name}:${key}`

			return new Promise((resolve) => {
				const request = store.put({ key: compositeKey, value })

				request.onsuccess = () => {
					resolve(true)
				}

				request.onerror = (event) => {
					DebugHelper.error('存储数据失败:', (event.target as IDBRequest).error)
					resolve(false)
				}
			})
		} catch (error) {
			DebugHelper.error('存储数据时发生错误:', error)
			return false
		}
	}

	/**
	 * 从IndexedDB获取数据
	 * @param name 刮削器名称
	 * @param key 数据的键
	 * @returns 返回获取的数据，如果不存在则返回null
	 */
	static async get<T = any>(name: string, key: string): Promise<T | null> {
		try {
			const db = await this.getDBConnection()
			const transaction = db.transaction(this.STORE_NAME, 'readonly')
			const store = transaction.objectStore(this.STORE_NAME)

			// 使用name:key的组合形式作为存储键
			const compositeKey = `${name}:${key}`

			return new Promise((resolve) => {
				const request = store.get(compositeKey)

				request.onsuccess = (event) => {
					const result = (event.target as IDBRequest).result
					if (result) {
						resolve(result.value)
					} else {
						resolve(null)
					}
				}

				request.onerror = (event) => {
					DebugHelper.error('获取数据失败:', (event.target as IDBRequest).error)
					resolve(null)
				}
			})
		} catch (error) {
			DebugHelper.error('获取数据时发生错误:', error)
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
			DebugHelper.info('数据库连接已初始化')
		} catch (error) {
			DebugHelper.error('初始化数据库连接失败:', error)
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
			DebugHelper.info('数据库连接已关闭')
		}
	}

	/**
	 * 获取数据库连接
	 * 如果连接不存在或已关闭，则自动重新连接
	 * @returns 返回数据库连接
	 * @private
	 */
	private static async getDBConnection(): Promise<IDBDatabase> {
		// 如果已有连接且未关闭，直接返回
		if (this._db && this._db.objectStoreNames.length > 0) {
			return this._db
		}

		// 如果正在连接中，等待连接完成
		if (this._connecting) {
			return this._connecting
		}

		// 创建新连接
		this._connecting = this.openDB()

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
	private static openDB(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)

			request.onerror = (event) => {
				DebugHelper.error('打开数据库失败:', (event.target as IDBRequest).error)
				reject((event.target as IDBRequest).error)
			}

			request.onsuccess = (event) => {
				const db = (event.target as IDBOpenDBRequest).result

				// 监听连接关闭事件，清除连接实例
				db.onclose = () => {
					DebugHelper.info('数据库连接已关闭')
					if (this._db === db) {
						this._db = null
					}
				}

				// 监听连接错误事件
				db.onerror = (event) => {
					DebugHelper.error('数据库连接错误:', event)
				}

				resolve(db)
			}

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result

				// 如果存储对象已存在，则删除
				if (db.objectStoreNames.contains(this.STORE_NAME)) {
					db.deleteObjectStore(this.STORE_NAME)
				}

				// 创建存储对象，使用key作为主键
				db.createObjectStore(this.STORE_NAME, { keyPath: 'key' })
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
