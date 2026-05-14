/* eslint-disable ts/no-namespace */
export namespace NumResponse {
    export interface JSONSchema {
        data: Data
    }

    export interface Data {
        ppvContent: PpvContent
        reviewSummary: ReviewSummary
    }

    export interface PpvContent {
        id: string
        floor: string
        title: string
        isExclusiveDelivery: boolean
        releaseStatus: string
        description: string
        notices: string[]
        isNoIndex: boolean
        isAllowForeign: boolean
        announcements: Announcement[]
        featureArticles: FeatureArticle[]
        packageImage: PackageImage
        sampleImages: Image[]
        products: Product[]
        mostPopularContentImage: Image
        pricing: PpvContentPricing
        weeklyRanking: null
        monthlyRanking: null
        wishlistCount: number
        sample2DMovie: null
        sampleVRMovie: null
        deliveryStartDate: Date
        makerReleasedAt: Date
        duration: number
        actresses: Actress[]
        histrions: any[]
        directors: Label[]
        series: null
        maker: Label
        label: Label
        genres: Label[]
        contentType: string
        relatedTags: Label[]
        makerContentId: string
        playableInfo: PlayableInfo
        __typename: string
    }

    export interface Actress {
        id: string
        name: string
        nameRuby: string
        imageUrl: string
        bustTop: string
        bust: string
        waist: string
        hip: string
        height: string
        ppvSummary: PpvSummary
        __typename: string
    }

    export interface PpvSummary {
        contentCount: number
        __typename: string
    }

    export interface Announcement {
        body: string
        __typename: string
    }

    export interface Label {
        id?: string
        name?: string
        __typename: LabelTypename
        tags?: Label[]
    }

    export enum LabelTypename {
        ContentTag = 'ContentTag',
        ContentTagGroup = 'ContentTagGroup',
        Director = 'Director',
        Genre = 'Genre',
        Label = 'Label',
        Maker = 'Maker'
    }

    export interface FeatureArticle {
        link: Link
        __typename: string
    }

    export interface Link {
        url: string
        text: string
        __typename: string
    }

    export interface Image {
        __typename: MostPopularContentImageTypename
        largeImageUrl: string
        imageUrl: string
        number?: number
    }

    export enum MostPopularContentImageTypename {
        ContentSampleImage = 'ContentSampleImage'
    }

    export interface PackageImage {
        largeUrl: string
        mediumUrl: string
        __typename: string
    }

    export interface PlayableInfo {
        playableDevices: PlayableDevice[]
        deviceGroups: DeviceGroup[]
        vrViewingType: string
        __typename: string
    }

    export interface DeviceGroup {
        id: string
        devices: Device[]
        __typename: string
    }

    export interface Device {
        deviceDeliveryUnits: DeviceDeliveryUnit[]
        isSupported: boolean
        __typename: string
    }

    export interface DeviceDeliveryUnit {
        id: string
        deviceDeliveryQualities: DeviceDeliveryQuality[]
        __typename: DeviceDeliveryUnitTypename
    }

    export enum DeviceDeliveryUnitTypename {
        DeviceDeliveryUnit = 'DeviceDeliveryUnit'
    }

    export interface DeviceDeliveryQuality {
        isStreamable: boolean
        isDownloadable: boolean
        __typename: DeviceDeliveryQualityTypename
    }

    export enum DeviceDeliveryQualityTypename {
        DeviceDeliveryQuality = 'DeviceDeliveryQuality'
    }

    export interface PlayableDevice {
        deviceDeliveryUnits: DeviceDeliveryUnit[]
        device: string
        name: string
        priority: number
        isSupported: boolean
        __typename: string
    }

    export interface PpvContentPricing {
        lowestEffectivePriceInclusiveTax: number
        lowestRegularPriceInclusiveTax: number
        sale: null
        pointRewardCampaign: null
        __typename: string
    }

    export interface Product {
        id: string
        priority: number
        deliveryUnit: DeliveryUnit
        pricing: ProductPricing
        expireDays: null
        licenseType: string
        shopName: string
        couponDiscount: CouponDiscount
        __typename: string
    }

    export interface CouponDiscount {
        coupon: Coupon
        discountedPriceInclusiveTax: number
        __typename: string
    }

    export interface Coupon {
        name: string
        expirationPolicy: ExpirationPolicy
        expirationAt: null
        minPayment: number
        destinationUrl: string
        __typename: string
    }

    export interface ExpirationPolicy {
        expirationDays: number
        __typename: string
    }

    export interface DeliveryUnit {
        id: string
        priority: number
        streamMaxQualityGroup: string
        downloadMaxQualityGroup: string
        __typename: string
    }

    export interface ProductPricing {
        regularPriceInclusiveTax: number
        effectivePriceInclusiveTax: null
        __typename: string
    }

    export interface ReviewSummary {
        average: number
        total: number
        withCommentTotal: number
        distributions: Distribution[]
        __typename: string
    }

    export interface Distribution {
        total: number
        withCommentTotal: number
        rating: number
        __typename: string
    }
}
