package com.boltbytes.boltbytes_media

import android.content.Context
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class CrashBridge(context: Context, messenger: BinaryMessenger) : MethodChannel.MethodCallHandler {
    private val channel = MethodChannel(messenger, CHANNEL)
    private val preferences = context.getSharedPreferences("bbmedia_native_crash", Context.MODE_PRIVATE)
    private val previous = Thread.getDefaultUncaughtExceptionHandler()
    private val handler = Thread.UncaughtExceptionHandler { thread, error ->
        val value = JSONObject()
            .put("kind", "native_uncaught")
            .put("message", error.message ?: error.javaClass.simpleName)
            .put("stack", error.stackTraceToString().take(32_000))
            .put("thread", thread.name.take(120))
            .put("occurredAt", utcTimestamp())
            .toString()
        preferences.edit().putString(KEY_PENDING, value).commit()
        previous?.uncaughtException(thread, error)
    }

    init {
        Thread.setDefaultUncaughtExceptionHandler(handler)
        channel.setMethodCallHandler(this)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        if (call.method != "drainPending") {
            result.notImplemented()
            return
        }
        val raw = preferences.getString(KEY_PENDING, null)
        preferences.edit().remove(KEY_PENDING).commit()
        if (raw == null) {
            result.success(emptyList<Map<String, Any?>>())
            return
        }
        val json = JSONObject(raw)
        result.success(
            listOf(
                mapOf(
                    "kind" to json.optString("kind"),
                    "message" to json.optString("message"),
                    "stack" to json.optString("stack"),
                    "occurredAt" to json.optString("occurredAt"),
                    "context" to mapOf("thread" to json.optString("thread")),
                ),
            ),
        )
    }

    fun dispose() {
        channel.setMethodCallHandler(null)
        if (Thread.getDefaultUncaughtExceptionHandler() === handler) {
            Thread.setDefaultUncaughtExceptionHandler(previous)
        }
    }

    companion object {
        private const val CHANNEL = "boltbytes.media/crash_reporting"
        private const val KEY_PENDING = "pending"

        private fun utcTimestamp(): String = SimpleDateFormat(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            Locale.US,
        ).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
    }
}
