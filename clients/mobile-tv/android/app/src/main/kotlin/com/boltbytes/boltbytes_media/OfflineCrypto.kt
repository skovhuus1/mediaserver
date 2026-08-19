package com.boltbytes.boltbytes_media

import android.content.Context
import android.os.Environment
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object OfflineCrypto {
    const val VERSION = 1
    const val CHUNK_SIZE = 1024 * 1024
    const val HEADER_SIZE = 32L
    private const val KEYSTORE = "AndroidKeyStore"
    private const val KEY_PREFIX = "bbmedia.offline."
    private val magic = "BBMOBE01".toByteArray(Charsets.US_ASCII)
    private val random = SecureRandom()

    data class Header(val chunkSize: Int, val plainSize: Long)

    fun offlineRoot(context: Context): File =
        File(context.getExternalFilesDir(Environment.DIRECTORY_MOVIES), "offline").apply { mkdirs() }

    fun getOrCreateKey(id: String): SecretKey {
        existingKey(id)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_PREFIX + id,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    fun existingKey(id: String): SecretKey? {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        return (store.getEntry(KEY_PREFIX + id, null) as? KeyStore.SecretKeyEntry)?.secretKey
    }

    fun deleteKey(id: String) {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        if (store.containsAlias(KEY_PREFIX + id)) store.deleteEntry(KEY_PREFIX + id)
    }

    fun writeHeader(file: RandomAccessFile, plainSize: Long) {
        file.seek(0)
        file.write(magic)
        file.writeInt(VERSION)
        file.writeInt(CHUNK_SIZE)
        file.writeLong(plainSize)
        file.writeLong(0)
    }

    fun readHeader(file: File): Header = RandomAccessFile(file, "r").use { input ->
        val actualMagic = ByteArray(magic.size).also(input::readFully)
        require(actualMagic.contentEquals(magic)) { "Offline file signature is invalid" }
        require(input.readInt() == VERSION) { "Offline encryption version is unsupported" }
        val chunkSize = input.readInt()
        val plainSize = input.readLong()
        input.readLong()
        require(chunkSize == CHUNK_SIZE && plainSize > 0) { "Offline file header is invalid" }
        Header(chunkSize, plainSize)
    }

    fun encryptChunk(key: SecretKey, index: Long, plain: ByteArray, length: Int): Pair<ByteArray, ByteArray> {
        val nonce = ByteArray(12).also(random::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, nonce))
        cipher.updateAAD(aad(index))
        return nonce to cipher.doFinal(plain, 0, length)
    }

    fun decryptChunk(file: RandomAccessFile, key: SecretKey, header: Header, index: Long): ByteArray {
        val plainOffset = index * header.chunkSize
        val plainLength = minOf(header.chunkSize.toLong(), header.plainSize - plainOffset).toInt()
        require(plainLength > 0) { "Offline range is invalid" }
        val recordSize = header.chunkSize.toLong() + 28L
        file.seek(HEADER_SIZE + index * recordSize)
        val nonce = ByteArray(12).also(file::readFully)
        val encrypted = ByteArray(plainLength + 16).also(file::readFully)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, nonce))
        cipher.updateAAD(aad(index))
        return cipher.doFinal(encrypted)
    }

    private fun aad(index: Long): ByteArray = ByteBuffer.allocate(24)
        .put(magic)
        .putInt(VERSION)
        .putInt(CHUNK_SIZE)
        .putLong(index)
        .array()
}
