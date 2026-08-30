package com.boltbytes.media.tv.v1.production

import android.content.Context
import coil.Coil
import coil.ImageLoader
import coil.imageLoader
import coil.disk.DiskCache
import coil.memory.MemoryCache
import coil.request.ImageRequest

object ProductionImagePipeline {
    fun install(context: Context) {
        Coil.setImageLoader(
            ImageLoader.Builder(context)
                .memoryCache {
                    MemoryCache.Builder(context)
                        .maxSizePercent(0.25)
                        .build()
                }
                .diskCache {
                    DiskCache.Builder()
                        .directory(context.cacheDir.resolve("tv-artwork-cache"))
                        .maxSizeBytes(256L * 1024L * 1024L)
                        .build()
                }
                .crossfade(false)
                .respectCacheHeaders(false)
                .build(),
        )
    }

    fun prefetch(context: Context, urls: Iterable<String?>) {
        urls.filterNotNull()
            .filter(String::isNotBlank)
            .distinct()
            .take(40)
            .forEach { url ->
                context.imageLoader.enqueue(
                    ImageRequest.Builder(context)
                        .data(url)
                        .size(720, 1080)
                        .memoryCacheKey(url)
                        .diskCacheKey(url)
                        .build(),
                )
            }
    }
}
