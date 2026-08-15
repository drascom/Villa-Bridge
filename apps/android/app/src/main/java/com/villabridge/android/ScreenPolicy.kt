package com.villabridge.android

import android.content.Context
import org.json.JSONObject

/**
 * Duvardaki tabletin ekran davranisi — SAYILAR HALINDE.
 *
 * Kullanicinin gordugu ayarlar (gece kararma saatleri, kademe adlari, aciklamalar) paylasilan
 * paneldedir; konak yalnizca uygular. Bu yuzden burada bir takvim, bir esik ya da bir tercih
 * YOKTUR: panel her degisiklikte ve dakikada bir "su anda gecerli olan" degerleri gonderir,
 * konak da onu pencereye yazar. Gece kararmasinin ne zaman basladigini bilen taraf paneldir.
 *
 * Kayit tek sebeple var: cihaz yeniden acildiginda panel yuklenene kadar gecen birkac saniyede
 * ekran, gece yarisi bile olsa, son bilinen parlaklikta acilsin — tam parlaklikta degil.
 */
data class ScreenPolicy(
    /** `always` · `dim` · `sleep` — bosta kalindiginda ne olacagi. */
    val mode: String,
    /** Bosta sayilmak icin gecmesi gereken sure; 0 kapali demek. */
    val idleSeconds: Int,
    /** Etkin parlaklik yuzdesi; -1 sistem parlakligini birakir. */
    val activeBrightness: Int,
    /** Bosta parlaklik yuzdesi (`dim` kipinde). */
    val idleBrightness: Int,
    /** Kararmis ekranda ilk dokunus yalnizca uyandirsin, dugmeye basmasin. */
    val touchToWake: Boolean
) {
    fun toJson(): JSONObject = JSONObject()
        .put("mode", mode)
        .put("idleSeconds", idleSeconds)
        .put("activeBrightness", activeBrightness)
        .put("idleBrightness", idleBrightness)
        .put("touchToWake", touchToWake)

    companion object {
        const val MODE_ALWAYS = "always"
        const val MODE_DIM = "dim"
        const val MODE_SLEEP = "sleep"

        /** Duvar paneli varsayilani: ekran hic uyumaz, parlaklik sisteme birakilir. */
        val DEFAULT = ScreenPolicy(MODE_ALWAYS, 0, -1, 12, true)

        fun fromJson(source: String?): ScreenPolicy? {
            if (source.isNullOrBlank()) return null
            return runCatching {
                val json = JSONObject(source)
                val mode = when (json.optString("mode")) {
                    MODE_DIM -> MODE_DIM
                    MODE_SLEEP -> MODE_SLEEP
                    else -> MODE_ALWAYS
                }
                ScreenPolicy(
                    mode = mode,
                    idleSeconds = json.optInt("idleSeconds", 0).coerceIn(0, 7_200),
                    activeBrightness = json.optInt("activeBrightness", -1).coerceIn(-1, 100),
                    idleBrightness = json.optInt("idleBrightness", 12).coerceIn(0, 100),
                    touchToWake = json.optBoolean("touchToWake", true)
                )
            }.getOrNull()
        }
    }
}

object ScreenPolicyStore {
    private const val PREFS = "villa_screen_policy"
    private const val KEY_POLICY = "policy"

    fun load(context: Context): ScreenPolicy =
        ScreenPolicy.fromJson(preferences(context).getString(KEY_POLICY, null)) ?: ScreenPolicy.DEFAULT

    fun save(context: Context, policy: ScreenPolicy) {
        preferences(context).edit().putString(KEY_POLICY, policy.toJson().toString()).apply()
    }

    private fun preferences(context: Context) = context.createDeviceProtectedStorageContext()
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
