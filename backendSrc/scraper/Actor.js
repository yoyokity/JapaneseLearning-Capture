export default class Actor {
    /**
     * 姓名
     * @type {string}
     */
    name
    /**
     * 照片链接
     * @type {string}
     */
    imgUrl
    /**
     * 性别
     * @type {string}
     */
    gender
    /**
     * 出生年月
     * @type {string}
     */
    birthdate
    /**
     * 三围
     * @type {string}
     */
    measurements
    /**
     * 罩杯
     * @type {string}
     */
    cup

    /**
     * 返回信息文本
     * @return {string}
     */
    infoText () {
        let text = `${this.name}:\n`
        if (this.birthdate) text += this.birthdate + '\n'
        if (this.measurements) text += this.measurements
        if (this.cup) text += ' ' + this.cup
        return text
    }

    /**
     * 从数据库中获取演员信息
     * @param {string} name
     * @return {Actor|null}
     */
    static get (name) {
        let a = yoyoNode.store.get(name)
        if (a) {
            let actor = new Actor()
            actor.name = a?.name
            actor.imgUrl = a?.imgUrl
            actor.gender = a?.gender
            actor.birthdate = a?.birthdate
            actor.measurements = a?.measurements
            actor.cup = a?.cup
            return actor
        }
        return null
    }

    /**
     * 将演员信息存入数据库中
     * @param {Actor} actor
     */
    static set (actor) {
        yoyoNode.store.set(actor.name, JSON.parse(JSON.stringify(actor)))
    }
}