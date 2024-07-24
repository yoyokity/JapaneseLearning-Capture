import  Store  from 'electron-store'

const store = new Store()

class Actor {
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
}

class ActorManage {
    /**
     * 获取一个演员信息
     * @param {string} name
     * @return {Actor}
     */
    getActor (name) {
        //检查数据库中有没有
        let actor = store.get(name)
        if (actor === undefined){
            actor = new Actor()
            actor.name = name
            store.set(name, actor)
        }
    }
}

export default new ActorManage()
