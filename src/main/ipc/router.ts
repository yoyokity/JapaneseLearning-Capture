import type { IDependencyState } from '../services/dependencies'
import type { ImageData, ImageResizeOptions, SaveImageOptions } from '../services/media'
import type { IUpdateState } from '../services/update'
import type { IStats, ReadDirectoryOptions } from '../utils/fs'
import type { CookiesSetDetails, IFetchOptions, IProxyConfig } from '../utils/net'

import { initTRPC } from '@trpc/server'
import { observable, observableToAsyncIterable } from '@trpc/server/observable'
import { app } from 'electron'
import superjson from 'superjson'
import { z } from 'zod'

import {
    agentConfigSchema,
    agentStreamOptionsSchema,
    aiLogListOptionsSchema,
    createAgentStream,
    log,
    searchEngineConfigSchema
} from '../agent'
import { openCloudflareWindow } from '../CloudflareWindow'
import { appPath } from '../globalStates'
import {
    getDependencies,
    getDependencyState,
    getLocalDependencies,
    installDependency,
    onDependencyStateChange
} from '../services/dependencies'
import { logTypeSchema, writeLog } from '../services/log'
import {
    createReencodeAudioStream,
    createSuperResolutionImageStream,
    getSuperResolutionModels,
    readImage,
    readMediaInfo,
    resizeImage,
    saveImage
} from '../services/media'
import { createSearchEngine } from '../services/search'
import { clearFolder, openInExplorer, removeEmptyFolders, setProgressBar } from '../services/system'
import {
    applyUpdate,
    checkUpdate,
    getUpdateError,
    getUpdateState,
    onUpdateStateChange,
    startDownload
} from '../services/update'
import { createSubtitleStream } from '../subtitle'
import {
    appendFile,
    basename,
    copy,
    createDirectory,
    dirname,
    extname,
    format,
    formatInputPathObjectSchema,
    getStatus,
    isDirectory,
    isExist,
    isFile,
    join,
    move,
    readDirectory,
    readFile,
    relative,
    remove,
    resolve,
    writeFile
} from '../utils/fs'
import {
    clearCache,
    clearProxy,
    encode,
    fetchOptionsSchema,
    get,
    ping,
    post,
    proxyConfigSchema,
    setCookie,
    setProxy
} from '../utils/net'

const t = initTRPC.create({ transformer: superjson })

/**
 * 公共 procedure
 */
const procedure = t.procedure

/**
 * 清理对象上的 undefined 字段
 */
function omitUndefined<T extends Record<string, any>>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

/** 订阅取消信号 */
function getAbortSignal(signal?: AbortSignal) {
    return signal ?? new AbortController().signal
}

/**
 * IPC 共享 router
 */
export const appRouter = t.router({
    check: procedure.query(() => true),
    app: t.router({
        isPackaged: procedure.query(() => app.isPackaged),
        appPath: procedure.query(() => appPath.root),
        arsrPath: procedure
            .output(
                z.object({
                    root: z.string(),
                    resources: z.string(),
                    extraResource: z.string(),
                    renderer: z.string()
                })
            )
            .query(() => ({
                root: appPath.arsr,
                resources: appPath.resources,
                extraResource: appPath.extraResource,
                renderer: appPath.renderer
            })),
        userPath: procedure.query(() => app.getPath('userData')),
        logsPath: procedure.query(() => app.getPath('logs')),
        tempPath: procedure.query(() => app.getPath('temp'))
    }),
    update: t.router({
        lastError: procedure.query(() => getUpdateError()),
        check: procedure.mutation(() => checkUpdate()),
        startDownload: procedure
            .input(z.object({ version: z.string() }))
            .mutation(({ input }) => startDownload(input.version)),
        progress: procedure.subscription(({ signal }) =>
            observableToAsyncIterable(
                observable<IUpdateState>((emit) => {
                    emit.next(getUpdateState())
                    return {
                        unsubscribe: onUpdateStateChange((state) => emit.next(state))
                    }
                }),
                getAbortSignal(signal)
            )
        ),
        applyUpdate: procedure.mutation(() => applyUpdate())
    }),
    dependency: t.router({
        local: procedure.query(() => getLocalDependencies()),
        list: procedure.query(() => getDependencies()),
        install: procedure
            .input(z.object({ id: z.string() }))
            .mutation(({ input }) => installDependency(input.id)),
        progress: procedure.subscription(({ signal }) =>
            observableToAsyncIterable(
                observable<IDependencyState>((emit) => {
                    emit.next(getDependencyState())
                    return {
                        unsubscribe: onDependencyStateChange((state) => emit.next(state))
                    }
                }),
                getAbortSignal(signal)
            )
        )
    }),
    filesystem: t.router({
        isExist: procedure.input(z.string()).query(({ input }) => isExist(input)),
        isFile: procedure.input(z.string()).query(({ input }) => isFile(input)),
        isDirectory: procedure.input(z.string()).query(({ input }) => isDirectory(input)),
        getStatus: procedure
            .input(z.union([z.string(), z.array(z.string())]))
            .query(async ({ input }): Promise<IStats | { path: string; stats: IStats }[]> => {
                return Array.isArray(input) ? getStatus(input) : getStatus(input)
            }),
        join: procedure.input(z.array(z.string())).query(({ input }) => join(...input)),
        resolve: procedure.input(z.array(z.string())).query(({ input }) => resolve(...input)),
        extname: procedure.input(z.string()).query(({ input }) => extname(input)),
        basename: procedure
            .input(
                z.object({
                    filePath: z.string(),
                    ext: z.string().optional()
                })
            )
            .query(({ input }) => basename(input.filePath, input.ext)),
        dirname: procedure.input(z.string()).query(({ input }) => dirname(input)),
        format: procedure.input(formatInputPathObjectSchema).query(({ input }) => format(input)),
        relative: procedure
            .input(
                z.object({
                    from: z.string(),
                    to: z.string()
                })
            )
            .query(({ input }) => relative(input.from, input.to)),
        createDirectory: procedure
            .input(z.string())
            .mutation(({ input }) => createDirectory(input)),
        readDirectory: procedure
            .input(
                z.object({
                    directory: z.string(),
                    pattern: z.union([z.string(), z.array(z.string())]),
                    options: z.custom<ReadDirectoryOptions>().optional()
                })
            )
            .query(({ input }) =>
                readDirectory(
                    input.directory,
                    input.pattern,
                    input.options ? omitUndefined(input.options) : undefined
                )
            ),
        remove: procedure.input(z.string()).mutation(({ input }) => remove(input)),
        copy: procedure
            .input(
                z.object({
                    sourcePath: z.string(),
                    destPath: z.string(),
                    overwrite: z.boolean().optional(),
                    filter: z.any().optional()
                })
            )
            .mutation(({ input }) =>
                copy(input.sourcePath, input.destPath, input.overwrite, input.filter)
            ),
        move: procedure
            .input(
                z.object({
                    sourcePath: z.string(),
                    destPath: z.string(),
                    overwrite: z.boolean().optional()
                })
            )
            .mutation(({ input }) => move(input.sourcePath, input.destPath, input.overwrite)),
        writeFile: procedure
            .input(
                z.object({
                    filePath: z.string(),
                    data: z.custom<string | ArrayBufferView>()
                })
            )
            .mutation(({ input }) => writeFile(input.filePath, input.data)),
        appendFile: procedure
            .input(
                z.object({
                    filePath: z.string(),
                    data: z.custom<string | Uint8Array>()
                })
            )
            .mutation(({ input }) => appendFile(input.filePath, input.data)),
        readFile: procedure
            .input(
                z.object({
                    filePath: z.string(),
                    encoding: z.string().optional()
                })
            )
            .query(({ input }) =>
                readFile(
                    input.filePath,
                    input.encoding as BufferEncoding | 'arrayBuffer' | undefined
                )
            ),
        writeLog: procedure
            .input(
                z.object({
                    type: logTypeSchema,
                    params: z.array(z.any())
                })
            )
            .mutation(({ input }) => writeLog(input.type, ...input.params)),
        setProgressBar: procedure.input(z.number()).mutation(({ input }) => setProgressBar(input)),
        openInExplorer: procedure.input(z.string()).mutation(({ input }) => openInExplorer(input)),
        clearFolder: procedure.input(z.string()).mutation(({ input }) => clearFolder(input)),
        removeEmptyFolders: procedure
            .input(
                z.object({
                    rootPath: z.string(),
                    videoExtnames: z.array(z.string())
                })
            )
            .mutation(({ input }) => removeEmptyFolders(input.rootPath, input.videoExtnames))
    }),
    media: t.router({
        saveImage: procedure
            .input(
                z.object({
                    imageData: z.custom<ImageData>(),
                    path: z.string(),
                    options: z.custom<SaveImageOptions>().optional()
                })
            )
            .mutation(({ input }) => saveImage(input.imageData, input.path, input.options)),
        readImage: procedure.input(z.string()).query(({ input }) => readImage(input)),
        resizeImage: procedure
            .input(
                z.object({
                    imageData: z.custom<ImageData>(),
                    options: z.custom<ImageResizeOptions>()
                })
            )
            .mutation(({ input }) => resizeImage(input.imageData, input.options)),
        readMediaInfo: procedure.input(z.string()).query(({ input }) => readMediaInfo(input)),
        getSuperResolutionModels: procedure.query(() => getSuperResolutionModels()),
        superResolutionImage: procedure
            .input(
                z.object({
                    imagePaths: z.array(z.string()),
                    modelPath: z.string()
                })
            )
            .subscription(({ input, signal }) =>
                observableToAsyncIterable(
                    createSuperResolutionImageStream(input.imagePaths, input.modelPath),
                    getAbortSignal(signal)
                )
            ),
        reencodeAudio: procedure
            .input(
                z.object({
                    inputPath: z.string(),
                    outputPath: z.string(),
                    codec: z.string(),
                    sampleRate: z.number().int(),
                    bitrate: z.string()
                })
            )
            .subscription(({ input, signal }) =>
                observableToAsyncIterable(
                    createReencodeAudioStream(
                        input.inputPath,
                        input.outputPath,
                        input.codec,
                        input.sampleRate,
                        input.bitrate
                    ),
                    getAbortSignal(signal)
                )
            )
    }),
    subtitle: t.router({
        generate: procedure
            .input(
                z.object({
                    inputPath: z.string(),
                    language: z.enum(['ja', 'en', 'zh', 'ko']),
                    llm: agentConfigSchema.optional()
                })
            )
            .subscription(({ input, signal }) =>
                observableToAsyncIterable(createSubtitleStream(input), getAbortSignal(signal))
            )
    }),
    agent: t.router({
        stream: procedure
            .input(agentStreamOptionsSchema)
            .subscription(({ input, signal }) =>
                observableToAsyncIterable(createAgentStream(input), getAbortSignal(signal))
            )
    }),
    search: t.router({
        test: procedure
            .input(
                z.object({
                    config: searchEngineConfigSchema,
                    query: z.string().optional()
                })
            )
            .mutation(async ({ input }) => {
                const engine = createSearchEngine(input.config)
                const result = await engine.search({
                    query: input.query ?? 'test',
                    maxResults: 1
                })

                return { provider: result.provider, count: result.results.length }
            })
    }),
    aiLog: t.router({
        listSessions: procedure
            .input(aiLogListOptionsSchema)
            .query(({ input }) => log.listSessions(input)),
        listSources: procedure.query(() => log.listSources()),
        getSession: procedure
            .input(z.object({ sessionId: z.string() }))
            .query(({ input }) => log.getSessionDetail(input.sessionId)),
        getSteps: procedure
            .input(z.object({ sessionId: z.string() }))
            .query(({ input }) => log.getSessionSteps(input.sessionId)),
        deleteSession: procedure
            .input(z.object({ sessionId: z.string() }))
            .mutation(({ input }) => log.deleteSession(input.sessionId)),
        deleteAllSessions: procedure.mutation(() => log.deleteAllSessions())
    }),
    net: t.router({
        get: procedure
            .input(
                z.object({
                    url: z.string(),
                    options: fetchOptionsSchema.optional()
                })
            )
            .query(({ input }) =>
                get(
                    input.url,
                    input.options ? (omitUndefined(input.options) as IFetchOptions) : undefined
                )
            ),
        post: procedure
            .input(
                z.object({
                    url: z.string(),
                    body: z.any(),
                    options: fetchOptionsSchema.optional()
                })
            )
            .mutation(({ input }) =>
                post(
                    input.url,
                    input.body,
                    input.options ? (omitUndefined(input.options) as IFetchOptions) : undefined
                )
            ),
        setProxy: procedure
            .input(proxyConfigSchema)
            .mutation(({ input }) => setProxy(omitUndefined(input) as IProxyConfig)),
        clearProxy: procedure.mutation(() => clearProxy()),
        clearCache: procedure.mutation(() => clearCache()),
        setCookie: procedure
            .input(z.custom<CookiesSetDetails>())
            .mutation(({ input }) => setCookie(input)),
        ping: procedure
            .input(
                z.object({
                    host: z.string(),
                    timeout: z.number().int().optional()
                })
            )
            .query(({ input }) => ping(input.host, input.timeout)),
        cloudflareVerify: procedure
            .input(
                z.object({
                    url: z.string(),
                    targetCookies: z.array(z.string()).optional(),
                    userAgent: z.string().optional()
                })
            )
            .mutation(({ input }) =>
                openCloudflareWindow(input.url, input.targetCookies, input.userAgent)
            ),
        encode: procedure
            .input(
                z.object({
                    value: z.string(),
                    encoding: z.string().optional()
                })
            )
            .query(({ input }) => encode(input.value, input.encoding))
    })
})

export type AppRouter = typeof appRouter
