package com.boltbytes.boltbytes_media

import android.content.Context
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.io.OutputStream
import java.io.RandomAccessFile
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class EncryptedMediaServer(
    @Suppress("UNUSED_PARAMETER") context: Context,
    private val mediaId: String,
    private val file: File,
    private val licenseExpiresAtMillis: Long,
) {
    private val token = UUID.randomUUID().toString()
    private val running = AtomicBoolean(false)
    private val clients = Executors.newCachedThreadPool()
    private var socket: ServerSocket? = null

    fun start(): String {
        check(running.compareAndSet(false, true)) { "Offline server is already running" }
        val next = ServerSocket(0, 24, InetAddress.getByName("127.0.0.1"))
        socket = next
        clients.execute {
            while (running.get()) {
                try {
                    val client = next.accept()
                    clients.execute { handle(client) }
                } catch (_: Exception) {
                    if (running.get()) stop()
                }
            }
        }
        return "http://127.0.0.1:${next.localPort}/media?token=$token"
    }

    fun stop() {
        if (!running.getAndSet(false)) return
        runCatching { socket?.close() }
        clients.shutdownNow()
    }

    private fun handle(client: Socket) {
        try {
            client.use { connection ->
                connection.soTimeout = 15_000
                val reader = BufferedReader(InputStreamReader(connection.getInputStream(), StandardCharsets.US_ASCII))
                val request = reader.readLine()?.split(' ') ?: return
                if (request.size < 2) return
                val method = request[0]
                val target = request[1]
                val headers = mutableMapOf<String, String>()
                while (true) {
                    val line = reader.readLine() ?: break
                    if (line.isEmpty()) break
                    val separator = line.indexOf(':')
                    if (separator > 0) headers[line.substring(0, separator).lowercase()] = line.substring(separator + 1).trim()
                }
                val suppliedToken = target.substringAfter("token=", "").substringBefore('&').let {
                    URLDecoder.decode(it, StandardCharsets.UTF_8.name())
                }
                if ((method != "GET" && method != "HEAD") || !target.startsWith("/media?") || suppliedToken != token) {
                    writeError(connection.getOutputStream(), 403, "Forbidden")
                    return
                }
                if (System.currentTimeMillis() >= licenseExpiresAtMillis) {
                    writeError(connection.getOutputStream(), 403, "Offline License Expired")
                    return
                }
                val header = OfflineCrypto.readHeader(file)
                val range = parseRange(headers["range"], header.plainSize)
                val partial = headers["range"] != null
                val output = connection.getOutputStream()
                writeHeaders(output, if (partial) 206 else 200, range.first, range.last, header.plainSize)
                if (method == "HEAD") return
                val key = OfflineCrypto.existingKey(mediaId) ?: error("Device-bound key is unavailable")
                RandomAccessFile(file, "r").use { encrypted ->
                    var cursor = range.first
                    while (cursor <= range.last) {
                        val chunkIndex = cursor / header.chunkSize
                        val chunk = OfflineCrypto.decryptChunk(encrypted, key, header, chunkIndex)
                        val chunkStart = chunkIndex * header.chunkSize
                        val from = (cursor - chunkStart).toInt()
                        val count = minOf(chunk.size - from, (range.last - cursor + 1).toInt())
                        try {
                            output.write(chunk, from, count)
                        } finally {
                            chunk.fill(0)
                        }
                        cursor += count
                    }
                }
                output.flush()
            }
        } catch (_: Exception) {
            runCatching { client.close() }
        }
    }

    private fun parseRange(value: String?, size: Long): LongRange {
        if (value.isNullOrBlank()) return 0L..(size - 1)
        val match = Regex("^bytes=(\\d*)-(\\d*)$").matchEntire(value.trim())
            ?: throw IllegalArgumentException("Invalid Range")
        val startRaw = match.groupValues[1]
        val endRaw = match.groupValues[2]
        val start: Long
        val end: Long
        if (startRaw.isEmpty()) {
            val suffix = endRaw.toLong().coerceAtLeast(1)
            start = (size - suffix).coerceAtLeast(0)
            end = size - 1
        } else {
            start = startRaw.toLong()
            end = if (endRaw.isEmpty()) size - 1 else endRaw.toLong().coerceAtMost(size - 1)
        }
        require(start in 0 until size && end >= start) { "Range is outside media" }
        return start..end
    }

    private fun writeHeaders(output: OutputStream, status: Int, start: Long, end: Long, total: Long) {
        val reason = if (status == 206) "Partial Content" else "OK"
        val headers = buildString {
            append("HTTP/1.1 $status $reason\r\n")
            append("Content-Type: video/mp4\r\n")
            append("Accept-Ranges: bytes\r\n")
            append("Cache-Control: no-store\r\n")
            append("Content-Length: ${end - start + 1}\r\n")
            if (status == 206) append("Content-Range: bytes $start-$end/$total\r\n")
            append("Connection: close\r\n\r\n")
        }
        output.write(headers.toByteArray(StandardCharsets.US_ASCII))
    }

    private fun writeError(output: OutputStream, status: Int, reason: String) {
        output.write(
            "HTTP/1.1 $status $reason\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                .toByteArray(StandardCharsets.US_ASCII),
        )
        output.flush()
    }
}
