package com.boltbytes.media.tv.v1.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ClosedCaption
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.HighQuality
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.NetworkCheck
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayCircle
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.SystemUpdate
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class SettingsCategory(
    val title: String,
    val subtitle: String,
    val icon: ImageVector,
    val color: Color,
)

private data class SettingPreviewRow(
    val title: String,
    val summary: String,
    val value: String,
    val enabled: Boolean? = null,
)

@Composable
fun SettingsVisualScreen(onBack: () -> Unit) {
    val categories = listOf(
        SettingsCategory("Afspilning", "Kvalitet og adfærd", Icons.Rounded.PlayCircle, V1Colors.Gold),
        SettingsCategory("Billede", "HDR og opskalering", Icons.Rounded.HighQuality, V1Colors.Cyan),
        SettingsCategory("Lyd", "Sprog og format", Icons.Rounded.GraphicEq, Color(0xFFB18ADB)),
        SettingsCategory("Undertekster", "Sprog, stil og timing", Icons.Rounded.ClosedCaption, V1Colors.Green),
        SettingsCategory("Downloads", "Lager og offline", Icons.Rounded.Storage, Color(0xFFE08C62)),
        SettingsCategory("Profil", "Autoplay og anbefalinger", Icons.Rounded.Person, Color(0xFF79A9E8)),
        SettingsCategory("System", "Netværk og opdateringer", Icons.Rounded.SystemUpdate, Color(0xFF9AA7B4)),
    )
    var selectedCategory by remember { mutableIntStateOf(0) }
    var switches by remember {
        mutableStateOf(
            mapOf(
                "Data saver" to false,
                "Afspil næste afsnit" to true,
                "Tillad opskalering" to true,
                "Diagnostisk overlay" to false,
                "Normalisér lydstyrke" to true,
                "Automatisk oprydning" to true,
                "Kun via Wi-Fi" to true,
                "Autoplay trailers" to false,
                "Personlige anbefalinger" to true,
                "Vis set-indikatorer" to true,
            ),
        )
    }
    var message by remember { mutableStateOf<String?>(null) }
    val selected = categories[selectedCategory]
    val rows = when (selectedCategory) {
        0 -> listOf(
            SettingPreviewRow("Streamingkvalitet", "Tilpasses automatisk efter forbindelse og enhed", "Auto · op til 4K"),
            SettingPreviewRow("Fast opløsning", "Bruges når automatisk kvalitet er slået fra", "2160p"),
            SettingPreviewRow("Data saver", "Reducerer båndbredde på begrænsede forbindelser", "Fra", false),
            SettingPreviewRow("Afspilningshastighed", "Standardhastighed for film og serier", "1,00×"),
            SettingPreviewRow("Afspil næste afsnit", "Starter næste afsnit efter reel afslutning", "Til", true),
        )
        1 -> listOf(
            SettingPreviewRow("Tillad opskalering", "Løfter lavere kilder uden unødige kvalitetshop", "Til", true),
            SettingPreviewRow("Opskaleringsmotor", "TV bruger enhedens billedprocessor", "Automatisk · TV"),
            SettingPreviewRow("HDR", "Matcher skærm og kilde automatisk", "Automatisk"),
            SettingPreviewRow("Bevægelsesudjævning", "Overlades som standard til TV'et", "TV"),
            SettingPreviewRow("Diagnostisk overlay", "Vis codec, bitrate og buffer", "Fra", false),
        )
        2 -> listOf(
            SettingPreviewRow("Foretrukket lydsprog", "Vælges automatisk når sporet findes", "Dansk"),
            SettingPreviewRow("Sekundært sprog", "Bruges som fallback", "Original"),
            SettingPreviewRow("Surround sound", "Matcher TV, soundbar eller receiver", "Automatisk · 5.1"),
            SettingPreviewRow("Normalisér lydstyrke", "Reducerer store spring mellem titler", "Til", true),
        )
        3 -> listOf(
            SettingPreviewRow("Underteksttilstand", "Vises når lydsprog ikke matcher", "Automatisk"),
            SettingPreviewRow("Foretrukket sprog", "Første valg for tilgængelige spor", "Dansk"),
            SettingPreviewRow("Tekststørrelse", "Skaleret til læseafstand på TV", "Mellem"),
            SettingPreviewRow("Baggrund", "Forbedrer læsbarhed på lyse scener", "Diskret"),
            SettingPreviewRow("Standardforskydning", "Anvendes før titel-specifik justering", "+0,0 sek."),
        )
        4 -> listOf(
            SettingPreviewRow("Downloadkvalitet", "Standard for nye offline-downloads", "1080p"),
            SettingPreviewRow("Ledig lagerplads", "Intern lagerplads på denne enhed", "18,4 GB"),
            SettingPreviewRow("Automatisk oprydning", "Fjerner sete downloads efter 48 timer", "Til", true),
            SettingPreviewRow("Kun via Wi-Fi", "Forhindrer downloads på målte netværk", "Til", true),
        )
        5 -> listOf(
            SettingPreviewRow("Autoplay trailers", "Afspil korte previews på detaljesider", "Fra", false),
            SettingPreviewRow("Personlige anbefalinger", "Bruger profilens historik og vurderinger", "Til", true),
            SettingPreviewRow("Profil-PIN", "Beskytter adgang til Henrik", "Aktiv"),
            SettingPreviewRow("Vis set-indikatorer", "Marker afsluttede film og afsnit", "Til", true),
        )
        else -> listOf(
            SettingPreviewRow("Server", "Fast produktionsendpoint", "media.boltbytes.com"),
            SettingPreviewRow("Forbindelse", "Aktuel netværksstatus", "Stabil · 286 Mbit/s"),
            SettingPreviewRow("Appversion", "Native Android TV-klient", "1.0.0"),
            SettingPreviewRow("Søg efter opdatering", "Kontroller GitHub release-feed", "Opdateret"),
            SettingPreviewRow("Enheds-ID", "Registreret Android TV-enhed", "BB-TV-8F21"),
        )
    }

    V1AmbientBackground(accent = selected.color.copy(alpha = 0.76f)) {
        Column(modifier = Modifier.fillMaxSize()) {
            V1ScreenHeader(
                section = "ENHED OG PROFIL",
                title = "INDSTILLINGER",
                onBack = onBack,
                trailing = { V1StatusDot("GEMT", V1Colors.Green) },
            )
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(start = 25.dp, end = 25.dp, bottom = 22.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Column(
                    modifier = Modifier
                        .width(232.dp)
                        .fillMaxHeight()
                        .padding(top = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    categories.forEachIndexed { index, category ->
                        V1FocusSurface(
                            onClick = { selectedCategory = index },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(55.dp),
                            radius = 14.dp,
                            focusedScale = 1.018f,
                            onFocused = { selectedCategory = index },
                            background = Brush.horizontalGradient(
                                listOf(
                                    if (selectedCategory == index) category.color.copy(alpha = 0.16f) else V1Colors.SurfaceSolid,
                                    Color(0xEB11161C),
                                ),
                            ),
                        ) { focused ->
                            Row(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(horizontal = 11.dp),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(32.dp)
                                        .background(category.color.copy(alpha = 0.16f), RoundedCornerShape(10.dp)),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(category.icon, contentDescription = null, tint = category.color, modifier = Modifier.size(17.dp))
                                }
                                Column {
                                    Text(
                                        category.title,
                                        color = if (focused) V1Colors.Gold else V1Colors.Text,
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Text(category.subtitle, color = V1Colors.MutedSoft, fontSize = 7.sp)
                                }
                            }
                        }
                    }
                }

                V1GlassPanel(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .padding(top = 8.dp),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(44.dp)
                                        .background(selected.color.copy(alpha = 0.17f), RoundedCornerShape(13.dp)),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(selected.icon, contentDescription = null, tint = selected.color, modifier = Modifier.size(22.dp))
                                }
                                Column {
                                    Text(selected.title, color = V1Colors.Text, fontSize = 19.sp, fontWeight = FontWeight.Black)
                                    Text(selected.subtitle, color = V1Colors.Muted, fontSize = 9.sp)
                                }
                            }
                            if (selectedCategory == 6) {
                                V1Button("Søg efter opdatering", onClick = {}, primary = true, icon = Icons.Rounded.SystemUpdate)
                            }
                        }
                        Spacer(Modifier.height(18.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                            rows.forEach { row ->
                                val shown = if (row.enabled == null) row else row.copy(enabled = switches[row.title] ?: row.enabled)
                                SettingRow(
                                    item = shown,
                                    accent = selected.color,
                                    onClick = {
                                        if (shown.enabled != null) {
                                            switches = switches + (shown.title to !shown.enabled)
                                            message = "${shown.title} er ${if (!shown.enabled) "slået til" else "slået fra"}"
                                        } else {
                                            message = "${shown.title}: ${shown.value}"
                                        }
                                    },
                                )
                            }
                        }
                        Spacer(Modifier.weight(1f))
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(V1Colors.Background.copy(alpha = 0.48f), RoundedCornerShape(12.dp))
                                .border(1.dp, Color.White.copy(alpha = 0.07f), RoundedCornerShape(12.dp))
                                .padding(horizontal = 12.dp, vertical = 9.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Rounded.NetworkCheck, contentDescription = null, tint = V1Colors.Green, modifier = Modifier.size(15.dp))
                                Text("Ændringer gemmes pr. kategori, når du forlader panelet.", color = V1Colors.Muted, fontSize = 8.sp)
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Rounded.Check, contentDescription = null, tint = V1Colors.Green, modifier = Modifier.size(13.dp))
                                Text("Alle ændringer gemt", color = V1Colors.Green, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
        message?.let {
            V1Toast(it, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 16.dp))
        }
    }
}

@Composable
private fun SettingRow(item: SettingPreviewRow, accent: Color, onClick: () -> Unit) {
    V1FocusSurface(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp),
        radius = 13.dp,
        focusedScale = 1.008f,
        background = Brush.horizontalGradient(listOf(Color(0xE9181F26), Color(0xD812171D))),
    ) { focused ->
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 13.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    item.title,
                    color = if (focused) V1Colors.Gold else V1Colors.Text,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(2.dp))
                Text(item.summary, color = V1Colors.MutedSoft, fontSize = 7.sp)
            }
            if (item.enabled != null) {
                Box(
                    modifier = Modifier
                        .width(35.dp)
                        .height(19.dp)
                        .background(
                            if (item.enabled) accent.copy(alpha = 0.62f) else Color(0xFF303A43),
                            RoundedCornerShape(50.dp),
                        )
                        .padding(3.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .align(if (item.enabled) Alignment.CenterEnd else Alignment.CenterStart)
                            .size(13.dp)
                            .background(if (item.enabled) Color.White else V1Colors.Muted, CircleShape),
                    )
                }
            } else {
                V1Pill(item.value, color = accent, emphasized = focused)
            }
        }
    }
}
