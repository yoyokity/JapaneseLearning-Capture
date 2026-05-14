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
