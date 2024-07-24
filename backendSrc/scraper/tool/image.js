import sharp from 'sharp'
import { Helper } from '../../../yo-electron-lib/Helper/helper.js'

class Image {
    /** @type {sharp.Sharp} */
    instance

    /**
     * @param {Buffer
     *         | ArrayBuffer
     *         | Uint8Array
     *         | Uint8ClampedArray
     *         | Int8Array
     *         | Uint16Array
     *         | Int16Array
     *         | Uint32Array
     *         | Int32Array
     *         | Float32Array
     *         | Float64Array
     *         | string} image
     */
    constructor (image) {
        this.instance = sharp(image)
    }

    save (path) {
        return this.instance.toFile(path)
    }

    resize (width, height) {
        return this.instance.resize(width, height)
    }

    /**
     * 超分
     * @param {boolean} anime 是否为动画图片
     * @returns {Promise<void>}
     */
    realesrgan (anime = false) {
        return new Promise(async (resolve, reject) => {
            //保存图片到temp
            let tempDir = Helper.path.tempDir.join('JLCap')
            Helper.path.createPath(tempDir.str)
            await this.save(tempDir.join('realesrgan_before.png').str)

            let ars = [
                '-i', tempDir.join('realesrgan_before.png').str,
                '-o', tempDir.join('realesrgan_after.png').str,
                '-n', anime ? 'realesrgan-x4plus-anime' : 'realesrgan-x4plus',
            ]

            //超分
            const realesrganPath = Helper.path.appDir.join('tools/realesrgan/realesrgan-ncnn-vulkan.exe')
            const realesrgan = new Helper.Cmd(realesrganPath.str)
            let cmd = realesrgan.run(ars)
            cmd.onExit((code, text) => {
                if (code === 0) {
                    this.instance = sharp(tempDir.join('realesrgan_after.png').str)
                    resolve()
                } else {
                    reject()
                }
            })
        })

    }
}

export default Image