package com.boltbytes.media.tv.v1.core

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

class TvApiException(
    val status: Int,
    val code: String,
    override val message: String,
) : IOException(message)

class TvApiClient(
    private val baseUrl: String,
    private val sessions: SecureSessionStore,
) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val refreshMutex = Mutex()
    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .callTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    suspend fun get(path: String): JSONObject = requestObject("GET", path, null, true)
    suspend fun post(path: String, body: JSONObject, authenticated: Boolean = true): JSONObject =
        requestObject("POST", path, body, authenticated)
    suspend fun patch(path: String, body: JSONObject): JSONObject = requestObject("PATCH", path, body, true)
    suspend fun put(path: String, body: JSONObject = JSONObject()): JSONObject = requestObject("PUT", path, body, true)
    suspend fun delete(path: String): JSONObject = requestObject("DELETE", path, null, true)

    suspend fun refresh(profileId: String? = null, profilePin: String? = null): TvTokens = refreshMutex.withLock {
        val snapshot = sessions.load() ?: throw TvApiException(401, "session_missing", "Sessionen findes ikke")
        val body = JSONObject().put("refreshToken", snapshot.refreshToken)
        profileId?.let { body.put("profileId", it) }
        profilePin?.takeIf(String::isNotBlank)?.let { body.put("profilePin", it) }
        val response = requestObject("POST", "/auth/refresh", body, false, false)
        parseAndStoreTokens(response, profileId ?: snapshot.activeProfileId)
    }

    fun resolveUrl(path: String?): String? {
        if (path.isNullOrBlank()) return null
        if (path.startsWith("https://") || path.startsWith("http://")) return path
        val origin = baseUrl.removeSuffix("/").removeSuffix("/api/v1")
        return when {
            path.startsWith("/api/") -> "$origin$path"
            path.startsWith('/') -> "$origin$path"
            else -> "${baseUrl.removeSuffix("/")}/$path"
        }
    }

    fun session(): SessionSnapshot? = sessions.load()
    fun save(tokens: TvTokens, profileId: String?) = sessions.save(tokens, profileId)
    fun clear() = sessions.clear()

    private suspend fun requestObject(
        method: String,
        path: String,
        body: JSONObject?,
        authenticated: Boolean,
        retryAuth: Boolean = true,
    ): JSONObject {
        val failedAccess = sessions.load()?.accessToken
        var result = execute(method, path, body, if (authenticated) failedAccess else null)
        if (authenticated && retryAuth && result.status == 401 && refreshAfterFailure(failedAccess)) {
            result = execute(method, path, body, sessions.load()?.accessToken)
        }
        if (result.status !in 200..299) throw apiError(result)
        if (result.payload.isBlank()) return JSONObject()
        return when (val parsed = JSONTokener(result.payload).nextValue()) {
            is JSONObject -> parsed
            is JSONArray -> JSONObject().put("items", parsed)
            else -> JSONObject().put("value", parsed)
        }
    }

    private suspend fun refreshAfterFailure(failedAccess: String?): Boolean = refreshMutex.withLock {
        val current = sessions.load() ?: return false
        if (failedAccess != null && current.accessToken != failedAccess) return true
        val response = execute(
            "POST",
            "/auth/refresh",
            JSONObject().put("refreshToken", current.refreshToken),
            null,
        )
        if (response.status !in 200..299) {
            if (response.status == 401 || response.status == 403) sessions.clear()
            return false
        }
        val json = JSONTokener(response.payload).nextValue() as? JSONObject ?: return false
        parseAndStoreTokens(json, current.activeProfileId)
        true
    }

    private fun parseAndStoreTokens(json: JSONObject, profileId: String?): TvTokens {
        val tokens = TvTokens(
            accessToken = json.getString("accessToken"),
            refreshToken = json.getString("refreshToken"),
            expiresInSeconds = json.longOrNull("expiresIn") ?: 900,
        )
        sessions.save(tokens, profileId)
        return tokens
    }

    private suspend fun execute(method: String, path: String, body: JSONObject?, accessToken: String?): RawResponse =
        withContext(Dispatchers.IO) {
            val builder = Request.Builder()
                .url(resolveUrl(path) ?: error("Invalid API path"))
                .header("Accept", "application/json")
                .header("User-Agent", "BoltBytes-TV-V1")
            accessToken?.let { builder.header("Authorization", "Bearer $it") }
            val requestBody = body?.toString()?.toRequestBody(jsonType)
            builder.method(method, if (method == "GET" || method == "DELETE") null else requestBody ?: "{}".toRequestBody(jsonType))
            client.newCall(builder.build()).execute().use { response ->
                RawResponse(response.code, response.body?.string().orEmpty())
            }
        }

    private fun apiError(response: RawResponse): TvApiException {
        val json = runCatching { JSONObject(response.payload) }.getOrNull()
        val nested = json?.optJSONObject("message")
        val code = json?.text("code") ?: nested?.text("code") ?: "http_${response.status}"
        val message = json?.text("message")
            ?: nested?.text("message")
            ?: "Serveren svarede med HTTP ${response.status}"
        return TvApiException(response.status, code, message)
    }

    private data class RawResponse(val status: Int, val payload: String)
}
