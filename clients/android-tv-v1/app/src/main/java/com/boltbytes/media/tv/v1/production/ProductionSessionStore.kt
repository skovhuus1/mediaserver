package com.boltbytes.media.tv.v1.production

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal class ProductionSessionStore(context: Context) {
    private val preferences = context.getSharedPreferences("tv_v1_secure_session", Context.MODE_PRIVATE)

    @Synchronized
    fun load(): ProductionTokens? {
        val access = decrypt(preferences.getString("access", null)) ?: return null
        val refresh = decrypt(preferences.getString("refresh", null)) ?: return null
        return ProductionTokens(access, refresh)
    }

    @Synchronized
    fun save(tokens: ProductionTokens) {
        preferences.edit().putString("access", encrypt(tokens.accessToken))
            .putString("refresh", encrypt(tokens.refreshToken)).commit()
    }

    @Synchronized
    fun clear() {
        preferences.edit().clear().commit()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val payload = cipher.iv + cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
        return Base64.encodeToString(payload, Base64.NO_WRAP)
    }

    private fun decrypt(value: String?): String? = try {
        if (value.isNullOrBlank()) return null
        val payload = Base64.decode(value, Base64.NO_WRAP)
        if (payload.size <= IV_BYTES) return null
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, payload.copyOfRange(0, IV_BYTES)))
        String(cipher.doFinal(payload.copyOfRange(IV_BYTES, payload.size)), StandardCharsets.UTF_8)
    } catch (_: Exception) {
        null
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val KEY_ALIAS = "boltbytes_tv_v1_session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
    }
}
