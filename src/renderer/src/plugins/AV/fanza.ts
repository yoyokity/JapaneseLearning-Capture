export const fanzaUrl = 'https://api.video.dmm.co.jp/graphql'

export function getTitleBody(searchTitle: string) {
    return {
        operationName: 'AvSearch',
        query: 'query AvSearch($limit: Int!, $offset: Int, $floor: PPVFloor, $sort: ContentSearchPPVSort!, $queryWord: String, $filter: ContentSearchPPVFilterInput, $facetLimit: Int!, $hasFacet: Boolean!, $hasGenreDescription: Boolean!, $legacyProductType: LegacyProductType = DOWNLOAD, $hasLegacyProductType: Boolean!, $isLoggedIn: Boolean!, $excludeUndelivered: Boolean!, $shouldFetchGenreRelatedWords: Boolean!, $shouldFetchDirectorRelatedWords: Boolean!, $shouldFetchLabelRelatedWords: Boolean!, $shouldFetchSeriesRelatedWords: Boolean!, $shouldFetchActressRelatedWords: Boolean!, $shouldFetchMakerRelatedWords: Boolean!, $shouldFetchHistrionRelatedWords: Boolean!, $shouldGetBookmark: Boolean!) {\n  legacySearchPPV(\n    limit: $limit\n    offset: $offset\n    floor: $floor\n    sort: $sort\n    queryWord: $queryWord\n    filter: $filter\n    facetLimit: $facetLimit\n    includeExplicit: true\n    excludeUndelivered: $excludeUndelivered\n  ) {\n    result {\n      contents {\n        ...searchContent\n        contentType\n        actresses {\n          id\n          name\n          __typename\n        }\n        maker {\n          id\n          name\n          __typename\n        }\n        isInWishList @include(if: $shouldGetBookmark)\n        __typename\n      }\n      facet @include(if: $hasFacet) {\n        ...contentSearchFacet\n        __typename\n      }\n      pageInfo {\n        ...paginationFragment\n        __typename\n      }\n      isNoIndex\n      searchCriteria {\n        ...contentSearchCriteria\n        __typename\n      }\n      osusumeGalleryLinks {\n        text\n        url\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\nfragment searchContent on PPVContentSearchContent {\n  id\n  title\n  packageImage {\n    mediumUrl\n    largeUrl\n    __typename\n  }\n  sampleImages {\n    number\n    largeUrl\n    __typename\n  }\n  sampleMovie {\n    hlsUrl\n    mp4Url\n    vrUrl\n    __typename\n  }\n  releaseStatus\n  review {\n    average\n    count\n    __typename\n  }\n  isExclusiveDelivery\n  bookmarkCount\n  salesInfo {\n    lowestPrice {\n      productId\n      price\n      discountPrice\n      legacyProductType\n      __typename\n    }\n    priceByLegacyProductType(legacyProductType: $legacyProductType) @include(if: $hasLegacyProductType) {\n      discountPrice\n      price\n      legacyProductType\n      __typename\n    }\n    campaign {\n      name\n      endAt\n      __typename\n    }\n    pointRewardCampaign {\n      name\n      __typename\n    }\n    hasMultiplePrices\n    __typename\n  }\n  isOnSale\n  deliveryStartAt\n  utilizationStatus @include(if: $isLoggedIn)\n  __typename\n}\nfragment contentSearchFacet on PPVContentSearchFacet {\n  floor {\n    items {\n      floor\n      count\n      __typename\n    }\n    __typename\n  }\n  actress {\n    items {\n      id\n      name\n      count\n      __typename\n    }\n    __typename\n  }\n  maker {\n    items {\n      id\n      name\n      count\n      __typename\n    }\n    __typename\n  }\n  label {\n    items {\n      id\n      name\n      count\n      __typename\n    }\n    __typename\n  }\n  series {\n    items {\n      id\n      name\n      count\n      __typename\n    }\n    __typename\n  }\n  genreAndCampaignCombined {\n    items {\n      ... on GenreFacetItem {\n        count\n        id\n        name\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n  __typename\n}\nfragment paginationFragment on OffsetPageInfoWithTotal {\n  offset\n  limit\n  hasNext\n  totalCount\n  __typename\n}\nfragment contentSearchCriteria on PPVContentSearchCriteria {\n  sort\n  filter {\n    actressIds {\n      ids {\n        id\n        name\n        nameRuby\n        relatedWords @include(if: $shouldFetchActressRelatedWords)\n        __typename\n      }\n      op\n      __typename\n    }\n    authorIds {\n      ids {\n        id\n        name\n        nameRuby\n        __typename\n      }\n      op\n      __typename\n    }\n    directorIds {\n      ids {\n        id\n        name\n        nameRuby\n        relatedWords @include(if: $shouldFetchDirectorRelatedWords)\n        __typename\n      }\n      op\n      __typename\n    }\n    genreIds {\n      ids {\n        id\n        name\n        relatedWords @include(if: $shouldFetchGenreRelatedWords)\n        description @include(if: $hasGenreDescription)\n        __typename\n      }\n      op\n      __typename\n    }\n    histrionIds {\n      ids {\n        id\n        name\n        nameRuby\n        relatedWords @include(if: $shouldFetchHistrionRelatedWords)\n        __typename\n      }\n      op\n      __typename\n    }\n    labelIds {\n      ids {\n        id\n        name\n        relatedWords @include(if: $shouldFetchLabelRelatedWords)\n        __typename\n      }\n      op\n      __typename\n    }\n    makerIds {\n      ids {\n        id\n        name\n        relatedWords @include(if: $shouldFetchMakerRelatedWords)\n        __typename\n      }\n      op\n      __typename\n    }\n    seriesIds {\n      ids {\n        id\n        name\n        relatedWords @include(if: $shouldFetchSeriesRelatedWords)\n        __typename\n      }\n      op\n      __typename\n    }\n    saleIds {\n      ids {\n        id\n        name\n        __typename\n      }\n      op\n      __typename\n    }\n    pointRewardCampaignIds {\n      ids {\n        id\n        name\n        __typename\n      }\n      op\n      __typename\n    }\n    contentTagIds {\n      ids {\n        id\n        name\n        __typename\n      }\n      op\n      __typename\n    }\n    isSaleItemsOnly\n    __typename\n  }\n  __typename\n}',
        variables: {
            excludeUndelivered: false,
            facetLimit: 100,
            filter: {
                isSaleItemsOnly: false
            },
            floor: 'AV',
            hasFacet: true,
            hasGenreDescription: false,
            hasLegacyProductType: false,
            isLoggedIn: false,
            limit: 120,
            offset: 0,
            queryWord: searchTitle,
            shouldFetchActressRelatedWords: false,
            shouldFetchDirectorRelatedWords: false,
            shouldFetchGenreRelatedWords: false,
            shouldFetchHistrionRelatedWords: false,
            shouldFetchLabelRelatedWords: false,
            shouldFetchMakerRelatedWords: false,
            shouldFetchSeriesRelatedWords: false,
            shouldGetBookmark: false,
            sort: 'RECOMMENDED'
        }
    }
}

export function getNumBody(num: string) {
    return {
        operationName: 'ContentPageData',
        query: 'query ContentPageData($id: ID!, $isLoggedIn: Boolean!, $isAmateur: Boolean!, $isAnime: Boolean!, $isAv: Boolean!, $isCinema: Boolean!, $isSP: Boolean!, $shouldFetchRelatedTags: Boolean = false, $pattern: ShelfGenreCurationPattern!, $shouldFetchCuratedGenreIdsForShelf: Boolean!, $shouldGetBookmark: Boolean!, $shouldGetLegacyBookmark: Boolean!) {\n  ppvContent(id: $id) {\n    ...ContentData\n    __typename\n  }\n  reviewSummary(contentId: $id) {\n    ...ReviewSummary\n    __typename\n  }\n  ...basketCountFragment @include(if: $isSP)\n}\nfragment ContentData on PPVContent {\n  id\n  floor\n  title\n  isExclusiveDelivery\n  releaseStatus\n  description\n  notices\n  isNoIndex\n  isAllowForeign\n  isInWishList @include(if: $shouldGetBookmark)\n  announcements {\n    body\n    __typename\n  }\n  featureArticles {\n    link {\n      url\n      text\n      __typename\n    }\n    __typename\n  }\n  packageImage {\n    largeUrl\n    mediumUrl\n    __typename\n  }\n  sampleImages {\n    number\n    imageUrl\n    largeImageUrl\n    __typename\n  }\n  products {\n    ...ProductData\n    __typename\n  }\n  mostPopularContentImage {\n    ... on ContentSampleImage {\n      __typename\n      largeImageUrl\n      imageUrl\n    }\n    ... on PackageImage {\n      __typename\n      largeUrl\n      mediumUrl\n    }\n    __typename\n  }\n  pricing {\n    lowestEffectivePriceInclusiveTax\n    lowestRegularPriceInclusiveTax\n    sale {\n      name\n      id\n      endAt\n      __typename\n    }\n    pointRewardCampaign {\n      name\n      id\n      endAt\n      promotionId\n      rate\n      __typename\n    }\n    __typename\n  }\n  weeklyRanking: ranking(term: Weekly)\n  monthlyRanking: ranking(term: Monthly)\n  wishlistCount\n  sample2DMovie {\n    highestMovieUrl\n    hlsMovieUrl\n    __typename\n  }\n  sampleVRMovie {\n    highestMovieUrl\n    __typename\n  }\n  curatedGenreIdsForShelf(pattern: $pattern) @include(if: $shouldFetchCuratedGenreIdsForShelf)\n  ...AmateurAdditionalContentData @include(if: $isAmateur)\n  ...AnimeAdditionalContentData @include(if: $isAnime)\n  ...AvAdditionalContentData @include(if: $isAv)\n  ...CinemaAdditionalContentData @include(if: $isCinema)\n  __typename\n}\nfragment ProductData on PPVProduct {\n  id\n  priority\n  deliveryUnit {\n    id\n    priority\n    streamMaxQualityGroup\n    downloadMaxQualityGroup\n    __typename\n  }\n  pricing {\n    regularPriceInclusiveTax\n    effectivePriceInclusiveTax\n    __typename\n  }\n  expireDays\n  utilizationStatus @include(if: $isLoggedIn)\n  licenseType\n  shopName\n  couponDiscount {\n    coupon {\n      name\n      expirationPolicy {\n        ... on CouponExpirationAt {\n          expirationAt\n          __typename\n        }\n        ... on CouponExpirationDay {\n          expirationDays\n          __typename\n        }\n        __typename\n      }\n      expirationAt\n      minPayment\n      destinationUrl\n      __typename\n    }\n    discountedPriceInclusiveTax\n    __typename\n  }\n  __typename\n}\nfragment AmateurAdditionalContentData on PPVContent {\n  deliveryStartDate\n  duration\n  amateurActress {\n    id\n    name\n    imageUrl\n    age\n    waist\n    bust\n    bustCup\n    height\n    hip\n    relatedContents {\n      id\n      title\n      __typename\n    }\n    __typename\n  }\n  maker {\n    id\n    name\n    __typename\n  }\n  label {\n    id\n    name\n    __typename\n  }\n  genres {\n    id\n    name\n    __typename\n  }\n  makerContentId\n  playableInfo {\n    ...PlayableInfo\n    __typename\n  }\n  __typename\n}\nfragment PlayableInfo on PlayableInfo {\n  playableDevices {\n    deviceDeliveryUnits {\n      id\n      deviceDeliveryQualities {\n        isDownloadable\n        isStreamable\n        __typename\n      }\n      __typename\n    }\n    device\n    name\n    priority\n    isSupported\n    __typename\n  }\n  deviceGroups {\n    id\n    devices {\n      deviceDeliveryUnits {\n        id\n        deviceDeliveryQualities {\n          isStreamable\n          isDownloadable\n          __typename\n        }\n        __typename\n      }\n      isSupported\n      __typename\n    }\n    __typename\n  }\n  vrViewingType\n  __typename\n}\nfragment AnimeAdditionalContentData on PPVContent {\n  deliveryStartDate\n  duration\n  series {\n    id\n    name\n    __typename\n  }\n  maker {\n    id\n    name\n    __typename\n  }\n  label {\n    id\n    name\n    __typename\n  }\n  genres {\n    id\n    name\n    __typename\n  }\n  makerContentId\n  playableInfo {\n    ...PlayableInfo\n    __typename\n  }\n  __typename\n}\nfragment AvAdditionalContentData on PPVContent {\n  deliveryStartDate\n  makerReleasedAt\n  duration\n  actresses {\n    id\n    name\n    nameRuby\n    imageUrl\n    bustTop\n    bust\n    waist\n    hip\n    height\n    ppvSummary(floor: AV) {\n      contentCount\n      __typename\n    }\n    isBookmarked @include(if: $shouldGetLegacyBookmark)\n    isFavorite @include(if: $shouldGetBookmark)\n    __typename\n  }\n  histrions {\n    id\n    name\n    __typename\n  }\n  directors {\n    id\n    name\n    __typename\n  }\n  series {\n    id\n    name\n    __typename\n  }\n  maker {\n    id\n    name\n    __typename\n  }\n  label {\n    id\n    name\n    __typename\n  }\n  genres {\n    id\n    name\n    __typename\n  }\n  contentType\n  relatedTags(limit: 16) @include(if: $shouldFetchRelatedTags) {\n    ... on ContentTagGroup {\n      tags {\n        id\n        name\n        __typename\n      }\n      __typename\n    }\n    ... on ContentTag {\n      id\n      name\n      __typename\n    }\n    __typename\n  }\n  makerContentId\n  playableInfo {\n    ...PlayableInfo\n    __typename\n  }\n  __typename\n}\nfragment CinemaAdditionalContentData on PPVContent {\n  deliveryStartDate\n  duration\n  actresses {\n    id\n    name\n    nameRuby\n    imageUrl\n    __typename\n  }\n  histrions {\n    id\n    name\n    __typename\n  }\n  directors {\n    id\n    name\n    __typename\n  }\n  authors {\n    id\n    name\n    __typename\n  }\n  series {\n    id\n    name\n    __typename\n  }\n  maker {\n    id\n    name\n    __typename\n  }\n  label {\n    id\n    name\n    __typename\n  }\n  genres {\n    id\n    name\n    __typename\n  }\n  makerContentId\n  playableInfo {\n    ...PlayableInfo\n    __typename\n  }\n  __typename\n}\nfragment ReviewSummary on ReviewSummary {\n  average\n  total\n  withCommentTotal\n  distributions {\n    total\n    withCommentTotal\n    rating\n    __typename\n  }\n  __typename\n}\nfragment basketCountFragment on Query {\n  legacyBasket @skip(if: $isLoggedIn) {\n    total\n    __typename\n  }\n  basketCount: user @include(if: $isLoggedIn) {\n    ... on Member {\n      ppvBasketItemCount\n      __typename\n    }\n    __typename\n  }\n  __typename\n}',
        variables: {
            id: num,
            isAmateur: false,
            isAnime: false,
            isAv: true,
            isCinema: false,
            isLoggedIn: false,
            isSP: false,
            pattern: 'NICHE',
            shouldFetchCuratedGenreIdsForShelf: false,
            shouldFetchRelatedTags: true,
            shouldGetBookmark: false,
            shouldGetLegacyBookmark: false
        }
    }
}

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
