/** MediaInfo 创建库信息 */
export interface IMediaInfoCreatingLibrary {
    name: string
    version: string
    url: string
}

/** MediaInfo 通用轨道附加信息 */
export interface IMediaInfoGeneralTrackExtra {
    Attachments: string
}

/** MediaInfo General 轨道 */
export interface IMediaInfoGeneralTrack {
    '@type': 'General'
    UniqueID: string
    VideoCount: string
    AudioCount: string
    TextCount: string
    FileExtension: string
    Format: string
    Format_Version: string
    FileSize: string
    Duration: string
    OverallBitRate: string
    FrameRate: string
    FrameCount: string
    StreamSize: string
    IsStreamable: string
    Encoded_Date: string
    File_Created_Date: string
    File_Created_Date_Local: string
    File_Modified_Date: string
    File_Modified_Date_Local: string
    Encoded_Application: string
    Encoded_Application_Name: string
    Encoded_Application_Version: string
    Encoded_Library: string
    extra?: IMediaInfoGeneralTrackExtra
}

/** MediaInfo Video 轨道 */
export interface IMediaInfoVideoTrack {
    '@type': 'Video'
    StreamOrder: string
    ID: string
    UniqueID: string
    Format: string
    Format_Profile: string
    Format_Level: string
    Format_Tier: string
    CodecID: string
    Duration: string
    BitRate: string
    Width: string
    Height: string
    Stored_Height: string
    Sampled_Width: string
    Sampled_Height: string
    PixelAspectRatio: string
    DisplayAspectRatio: string
    FrameRate_Mode: string
    FrameRate: string
    FrameRate_Num: string
    FrameRate_Den: string
    FrameCount: string
    ColorSpace: string
    ChromaSubsampling: string
    BitDepth: string
    Delay: string
    Delay_Source: string
    StreamSize: string
    Default: string
    Forced: string
}

/** MediaInfo Audio 轨道 */
export interface IMediaInfoAudioTrack {
    '@type': 'Audio'
    StreamOrder: string
    ID: string
    UniqueID: string
    Format: string
    Format_Settings_SBR: string
    Format_AdditionalFeatures: string
    CodecID: string
    Duration: string
    BitRate: string
    Channels: string
    ChannelPositions: string
    ChannelLayout: string
    SamplesPerFrame: string
    SamplingRate: string
    SamplingCount: string
    FrameRate: string
    FrameCount: string
    Compression_Mode: string
    Delay: string
    Delay_Source: string
    Video_Delay: string
    StreamSize: string
    Default: string
    Forced: string
    Language: string
}

/** MediaInfo Text 轨道 */
export interface IMediaInfoTextTrack {
    '@type': 'Text'
    StreamOrder: string
    ID: string
    UniqueID: string
    Format: string
    CodecID: string
    Duration: string
    BitRate: string
    FrameRate: string
    FrameCount: string
    ElementCount: string
    Compression_Mode: string
    StreamSize: string
    Language: string
    Default: string
    Forced: string
}

/** MediaInfo 轨道 */
export type IMediaInfoTrack =
    | IMediaInfoGeneralTrack
    | IMediaInfoVideoTrack
    | IMediaInfoAudioTrack
    | IMediaInfoTextTrack

/** MediaInfo 媒体信息 */
export interface IMediaInfoMedia {
    '@ref': string
    track: IMediaInfoTrack[]
}

/** MediaInfo JSON 结构 */
export interface IMediaInfo {
    creatingLibrary: IMediaInfoCreatingLibrary
    media: IMediaInfoMedia
}

export interface IDenoiseOptions {
    /**
     * 滤波直径（邻域大小）
     * @description 每个像素参与计算的邻域范围。正整数，一般用奇数；实际小于等于 0 时会自动从 sigmaSpace 计算。
     * @remark 5 时细节保留较好、去噪较弱；
     * @remark 9 是常用平衡值；
     * @remark 15 平滑更强，但会开始丢失细节。
     * @remark 实时应用建议 5~9，离线处理可到 15。
     * @default 9
     */
    d?: number
    /**
     * 颜色相似度阈值
     * @description 控制颜色差多少仍参与模糊，是双边滤波最核心的参数。值越小越保留边缘，值越大去噪越强。
     * @remark 30 时只有非常相似的颜色才会混合；
     * @remark 75 为平衡值；
     * @remark 150 时接近高斯模糊，边缘会被明显抹掉。
     * @remark 人像美颜建议 50~75，噪声严重可用 75~100，优先保边可用 30~50。
     * @default 75
     */
    sigmaColor?: number
    /**
     * 空间距离权重
     * @description 控制距离多远仍参与模糊。值越大，远处像素影响越大，整体越模糊。
     * @remark 通常可与 sigmaColor 设置成相同的值；例如 d = 9 时，常配合 75 使用。
     * @default 75
     */
    sigmaSpace?: number
}
