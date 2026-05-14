/* eslint-disable ts/no-namespace */
export namespace TitleResponse {
    export interface JSONSchema {
        data: Data
    }

    export interface Data {
        legacySearchPPV: LegacySearchPPV
    }

    export interface LegacySearchPPV {
        result: Result
        __typename: string
    }

    export interface Result {
        contents: Content[]
        facet: Facet
        pageInfo: PageInfo
        isNoIndex: boolean
        searchCriteria: SearchCriteria
        osusumeGalleryLinks: null
        __typename: string
    }

    export interface Content {
        id: string
        title: string
        packageImage: PackageImage
        sampleImages: SampleImage[]
        sampleMovie: SampleMovie
        releaseStatus: ReleaseStatus | null
        review: Review
        isExclusiveDelivery: boolean
        bookmarkCount: number
        salesInfo: SalesInfo
        isOnSale: boolean
        deliveryStartAt: Date
        __typename: ContentTypename
        contentType: ContentType
        actresses: Maker[]
        maker: Maker
    }

    export enum ContentTypename {
        PPVContentSearchContent = 'PPVContentSearchContent'
    }

    export interface Maker {
        id?: string
        name?: string
        __typename: MakerTypename
        count?: number
    }

    export enum MakerTypename {
        CampaignFacetItem = 'CampaignFacetItem',
        ContentSearchActress = 'ContentSearchActress',
        ContentSearchMaker = 'ContentSearchMaker',
        GenreFacetItem = 'GenreFacetItem',
        IDFacetItem = 'IdFacetItem'
    }

    export enum ContentType {
        TwoDimension = 'TWO_DIMENSION',
        VR = 'VR'
    }

    export interface PackageImage {
        mediumUrl: string
        largeUrl: string
        __typename: PackageImageTypename
    }

    export enum PackageImageTypename {
        ContentSearchPackageImage = 'ContentSearchPackageImage'
    }

    export enum ReleaseStatus {
        LatestRelease = 'LATEST_RELEASE',
        NewRelease = 'NEW_RELEASE',
        PreOrder = 'PRE_ORDER',
        SemiNewRelease = 'SEMI_NEW_RELEASE'
    }

    export interface Review {
        average: number
        count: number
        __typename: ReviewTypename
    }

    export enum ReviewTypename {
        ContentSearchReview = 'ContentSearchReview'
    }

    export interface SalesInfo {
        lowestPrice: LowestPrice
        campaign: Campaign | null
        pointRewardCampaign: null
        hasMultiplePrices: boolean
        __typename: SalesInfoTypename
    }

    export enum SalesInfoTypename {
        ContentSearchSalesInfo = 'ContentSearchSalesInfo'
    }

    export interface Campaign {
        name: null | string
        endAt: Date
        __typename: string
    }

    export interface LowestPrice {
        productId: string
        price: number
        discountPrice: number | null
        legacyProductType: LegacyProductType
        __typename: LowestPriceTypename
    }

    export enum LowestPriceTypename {
        ContentSearchPrice = 'ContentSearchPrice'
    }

    export enum LegacyProductType {
        Download = 'DOWNLOAD',
        Empty = '',
        Streaming = 'STREAMING'
    }

    export interface SampleImage {
        number: number
        largeUrl: string
        __typename: SampleImageTypename
    }

    export enum SampleImageTypename {
        ContentSearchSampleImage = 'ContentSearchSampleImage'
    }

    export interface SampleMovie {
        hlsUrl: null | string
        mp4Url: null | string
        vrUrl: null | string
        __typename: SampleMovieTypename
    }

    export enum SampleMovieTypename {
        ContentSearchSampleMovie = 'ContentSearchSampleMovie'
    }

    export interface Facet {
        floor: Floor
        actress: Actress
        maker: Actress
        label: Actress
        series: Actress
        genreAndCampaignCombined: Actress
        __typename: string
    }

    export interface Actress {
        items: Maker[]
        __typename: string
    }

    export interface Floor {
        items: Item[]
        __typename: string
    }

    export interface Item {
        floor: string
        count: number
        __typename: string
    }

    export interface PageInfo {
        offset: number
        limit: number
        hasNext: boolean
        totalCount: number
        __typename: string
    }

    export interface SearchCriteria {
        sort: string
        filter: Filter
        __typename: string
    }

    export interface Filter {
        actressIds: null
        authorIds: null
        directorIds: null
        genreIds: null
        histrionIds: null
        labelIds: null
        makerIds: null
        seriesIds: null
        saleIds: null
        pointRewardCampaignIds: null
        contentTagIds: null
        isSaleItemsOnly: boolean
        __typename: string
    }
}
