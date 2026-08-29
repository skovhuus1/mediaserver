package com.boltbytes.media.tv.v1.core

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class SessionSnapshot(
    val accessToken: String,
    val refreshToken: String,
    val activeProfileId: String?,
)

class SecureSessionStore(context: Context) {
    private val preferences = context.getSharedPreferences("bb_tv_v1_secure_session", Context.MODE_PRIVATE)
    private val lock = Any()

    fun load(): SessionSnapshot? = synchronized(lock) {
        val access = decrypt(preferences.getString(KEY_ACCESS, null)) ?: return@synchronized null
        val refresh = decrypt(preferences.getString(KEY_REFRESH, null)) ?: return@synchronized null
        SessionSnapshot(
            accessToken = access,
            refreshToken = refresh,
            activeProfileId = decrypt(preferences.getString(KEY_PROFILE, null)),
        )
    }

    fun save(tokens: TvTokens, activeProfileId: String?) = synchronized(lock) {
        preferences.edit()
            .putString(KEY_ACCESS, encrypt(tokens.accessToken))
            .putString(KEY_REFRESH, encrypt(tokens.refreshToken))
            .apply {
                if (activeProfileId == null) remove(KEY_PROFILE) else putString(KEY_PROFILE, encrypt(activeProfileId))
            }
            .commit()
    }

    fun clear() = synchronized(lock) {
        preferences.edit().clear().commit()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        val payload = Base64.encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        return "$iv:$payload"
    }

    private fun decrypt(value: String?): String? {
        if (value.isNullOrBlank()) return null
        return runCatching {
            val parts = value.split(':', limit = 2)
            require(parts.size == 2)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                secretKey(),
                GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)),
            )
            cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)).toString(Charsets.UTF_8)
        }.getOrNull()
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            generateKey()
        }
    }

    private companion object {
        const val KEY_ALIAS = "boltbytes_tv_v1_session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val KEY_ACCESS = "access"
        const val KEY_REFRESH = "refresh"
        const val KEY_PROFILE = "profile"
    }
}
