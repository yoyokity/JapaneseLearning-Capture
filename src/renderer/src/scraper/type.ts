/**
 * 性别
 */
export type Gender = 'male' | 'female'

export interface IActor {
	/**
	 * 姓名
	 */
	name: string
	/**
	 * 角色
	 */
	role: string
	/**
	 * 照片URL
	 */
	imgUrl: string
}

export interface IVideo {
	/**
	 * 使用的刮削器名称
	 */
	scraperName: string
	/**
	 * 大标题
	 */
	title: string
	/**
	 * 原始标题，jellyfin中会显示在大标题下方作为小标题
	 */
	originaltitle: string
	/**
	 * 排序标题，名称排序时会以此为标准
	 */
	sorttitle: string
	/**
	 * 宣传词
	 */
	tagline: string
	/**
	 * 编号，如番号、网站-编号
	 */
	num: string
	/**
	 * 分级，如JP-18+
	 */
	mpaa: string
	/**
	 * 评分，尽量以10分为满分
	 */
	rating: string
	/**
	 * 导演
	 */
	director: string
	/**
	 * 演员，需要包含姓名、照片链接（可包含性别、出生年月、三围，可以放在视频简介里，因为nfo读取不到这些信息）
	 */
	actor: IActor[]
	/**
	 * 发行商
	 */
	studio: string
	/**
	 * 制片商
	 */
	maker: string
	/**
	 * 影片系列
	 */
	set: string
	/**
	 * 影片标签
	 */
	tag: string[]
	/**
	 * 影片类型
	 */
	genre: string[]
	/**
	 * 简介
	 */
	plot: string
	/**
	 * 发行年份
	 */
	year: string
	/**
	 * 首映日期，一般与releasedate相同
	 */
	premiered: string
	/**
	 * 上映日期
	 */
	releasedate: string
}
