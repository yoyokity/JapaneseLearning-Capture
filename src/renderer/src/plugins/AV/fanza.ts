import type { NumResponse } from '@renderer/plugins/AV/fanza.num.type'
import type { TitleResponse } from '@renderer/plugins/AV/fanza.title.type'
import type { IAvContext } from '@renderer/plugins/AV/type'

import { EncodeHelper, NetHelper } from '@renderer/helper'
import { loggerFanza } from '@renderer/plugins/AV/type'

NetHelper.setCookie({
    url: 'https://video.dmm.co.jp/',
    domain: 'dmm.co.jp',
    value: {
        age_check_done: '1'
    }
})

const url = 'https://api.video.dmm.co.jp/graphql'

async function numSearch(signal: AbortSignal, context: IAvContext): Promise<boolean> {
    if (!context.num.fanza) return false

    const res = await NetHelper.post(url, getNumBody(context.num.fanza), {
        signal,
        parse: 'json',
        delay: 0
    })
    if (!res.ok) return false

    const content: NumResponse.PpvContent | null =
        (res.body as NumResponse.JSONSchema)?.data?.ppvContent || null
    if (!content) return false

    context.webContent.fanza = content
    return true
}

export async function getWebContentFanza(
    searchTitle: string,
    context: IAvContext,
    signal: AbortSignal
) {
    // 先使用编号搜索
    if (context.num.fanza) {
        const re = await numSearch(signal, context)
        if (re) {
            loggerFanza.success(`获取到视频内容`)
            return
        }

        loggerFanza.log(`使用编号搜索失败，使用原标题搜索`)
    }

    // 如果编号搜索失败，则使用原标题搜索
    const res = await NetHelper.post(url, getTitleBody(searchTitle.split(/\s+/)[0]), {
        signal,
        parse: 'json',
        delay: 0
    })
    if (!res.ok) {
        loggerFanza.warn(`获取内容失败`)
        return
    }

    const contents: TitleResponse.Content[] | null =
        (res.body as TitleResponse.JSONSchema)?.data?.legacySearchPPV?.result?.contents || null
    if (!contents || contents.length === 0) {
        loggerFanza.warn(`未找到匹配的视频`)
        return
    }

    loggerFanza.log(
        `搜索到${contents.length}个视频作为候选项：`,
        contents.map((item) => item.id)
    )

    // 找到最匹配的视频
    const match = EncodeHelper.bestMatch(
        searchTitle,
        contents.map((item) => item.title)
    )
    if (!match) {
        loggerFanza.warn(`未找到匹配的视频`)
        return
    }

    const targetVideo = contents[match.index]

    loggerFanza.log(`选择第 ${match.index + 1} 个视频: ${targetVideo.id}`)

    // 再使用编号搜索
    context.num.fanza = targetVideo.id

    const re = await numSearch(signal, context)
    if (re) {
        loggerFanza.success(`获取到视频内容`)
        return
    }

    loggerFanza.warn(`获取内容失败`)
}

function getTitleBody(searchTitle: string) {
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

function getNumBody(num: string) {
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
