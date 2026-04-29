import type { ReadDirectoryOptions } from './filesystem'
import type { ImageData } from './image'
import type { IAiStartOptions, IFetchOptions, IProxyConfig } from './net'

import { initTRPC } from '@trpc/server'
import { app } from 'electron'
import { z } from 'zod'

import { openCloudflareWindow } from '../CloudflareWindow'
import { appPath } from '../globalStates'
import {
    appendFile,
    basename,
    clearFolder,
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
    logTypeSchema,
    move,
    openInExplorer,
    readDirectory,
    readDirectoryOptionsSchema,
    readFile,
    relative,
    remove,
    removeEmptyFolders,
    resolve,
    writeFile,
    writeLog
} from './filesystem'
import { readImage, saveImage, superResolutionImage } from './image'
import {
    aiStartOptionsSchema,
    clearCache,
    clearProxy,
    createAiStream,
    encode,
    fetchOptionsSchema,
    get,
    ping,
    post,
    proxyConfigSchema,
    setProxy
} from './net'

const t = initTRPC.create()

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

/**
 * IPC 共享 router
 */
export const appRouter = t.router({
    check: procedure.query(() => true),
    app: t.router({
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
    filesystem: t.router({
        isExist: procedure.input(z.string()).query(({ input }) => isExist(input)),
        isFile: procedure.input(z.string()).query(({ input }) => isFile(input)),
        isDirectory: procedure.input(z.string()).query(({ input }) => isDirectory(input)),
        getStatus: procedure.input(z.string()).query(({ input }) => getStatus(input)),
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
                    patterns: z.union([z.string(), z.array(z.string())]),
                    options: readDirectoryOptionsSchema.optional()
                })
            )
            .query(({ input }) =>
                readDirectory(
                    input.patterns,
                    input.options
                        ? (omitUndefined(input.options) as ReadDirectoryOptions)
                        : undefined
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
        openInExplorer: procedure.input(z.string()).mutation(({ input }) => openInExplorer(input)),
        clearFolder: procedure.input(z.string()).mutation(({ input }) => clearFolder(input)),
        removeEmptyFolders: procedure
            .input(z.string())
            .mutation(({ input }) => removeEmptyFolders(input))
    }),
    image: t.router({
        saveImage: procedure
            .input(
                z.object({
                    imageData: z.custom<ImageData>(),
                    path: z.string()
                })
            )
            .mutation(({ input }) => saveImage(input.imageData, input.path)),
        readImage: procedure.input(z.string()).query(({ input }) => readImage(input)),
        superResolutionImage: procedure
            .input(
                z.object({
                    imagePath: z.string(),
                    anime: z.boolean().optional()
                })
            )
            .mutation(({ input }) => superResolutionImage(input.imagePath, input.anime))
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
        ai: procedure
            .input(aiStartOptionsSchema)
            .subscription(({ input }) => createAiStream(omitUndefined(input) as IAiStartOptions)),
        setProxy: procedure
            .input(proxyConfigSchema)
            .mutation(({ input }) => setProxy(omitUndefined(input) as IProxyConfig)),
        clearProxy: procedure.mutation(() => clearProxy()),
        clearCache: procedure.mutation(() => clearCache()),
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
                    targetCookies: z.array(z.string()).optional()
                })
            )
            .mutation(({ input }) => openCloudflareWindow(input.url, input.targetCookies)),
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
