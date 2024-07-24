import fs from 'fs'
import { create } from 'xmlbuilder2'

export default class Nfo {
    /** @type {import('xmlbuilder2/lib/interfaces.d.ts').XMLBuilder} */
    instance

    constructor (xmlObj = null) {
        this.instance = create({ version: '1.0', encoding: 'UTF-8' })
        if (xmlObj) {
            this.instance.ele(xmlObj)
        }
    }

    str(){
        return this.instance.end({ prettyPrint: true })
    }

    save (path) {
        fs.writeFileSync(path, this.str(), 'utf8')
    }
}