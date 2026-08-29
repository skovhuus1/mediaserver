package com.boltbytes.media.tv.v1

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private enum class PreviewShape { LANDSCAPE, POSTER }
private data class RailDestination(val icon: ImageVector, val label: String)
private data class PreviewTitle(
    val title: String,
    val subtitle: String,
    val eyebrow: String,
    val year: String,
    val progress: Float,
    val badge: String?,
    val colors: List<Color>,
)
private data class PreviewRow(
    val title: String,
    val shape: PreviewShape,
    val items: List<PreviewTitle>,
)

private val previewRows = listOf(
    PreviewRow(
        "Fortsæt med at se",
        PreviewShape.LANDSCAPE,
        listOf(
            PreviewTitle("The Sinner", "S2 E4  ·  26 min tilbage", "Krimi", "2021", 0.62f, null, listOf(Color(0xFF406F82), Color(0xFF17212A))),
            PreviewTitle("DNA", "S1 E7  ·  39 min tilbage", "Nordic noir", "2019", 0.34f, null, listOf(Color(0xFF94533D), Color(0xFF24140F))),
            PreviewTitle("Sommer", "S2 E4  ·  12 min tilbage", "Drama", "2009", 0.81f, null, listOf(Color(0xFFA2875D), Color(0xFF251D13))),
            PreviewTitle("Reacher", "S3 E2  ·  44 min tilbage", "Action", "2025", 0.18f, null, listOf(Color(0xFF63717E), Color(0xFF171D22))),
        ),
    ),
    PreviewRow(
        "Senest tilføjet",
        PreviewShape.POSTER,
        listOf(
            PreviewTitle("Helt Sort", "Ny sæson", "Serie", "2026", 0f, "7", listOf(Color(0xFFA4593D), Color(0xFF25120C))),
            PreviewTitle("The Veil", "Miniserie", "Spænding", "2024", 0f, "NY", listOf(Color(0xFF354F82), Color(0xFF0D1524))),
            PreviewTitle("Hill Song", "Film", "Drama", "2025", 0f, null, listOf(Color(0xFFB47D34), Color(0xFF291A09))),
            PreviewTitle("The Mob", "Dokumentar", "True crime", "2023", 0f, null, listOf(Color(0xFF687783), Color(0xFF151A1E))),
            PreviewTitle("The Idol", "Ny episode", "Drama", "2025", 0f, "1", listOf(Color(0xFF7B496A), Color(0xFF1F101B))),
        ),
    ),
)

@Composable
fun HubVisualScreen(onBackToLogin: () -> Unit) {
    var selected by remember { mutableStateOf(previewRows.first().items.first()) }
    V1AmbientBackground(
        accent = selected.colors.first(),
        modifier = Modifier.fillMaxSize(),
    ) {
        V1Glow(
            selected.colors.first(),
            Modifier.size(570.dp).align(Alignment.TopEnd).offset(x = 90.dp, y = (-145).dp),
        )
        Row(Modifier.fillMaxSize()) {
            HubRail(onBackToLogin)
            Column(Modifier.fillMaxSize()) {
                HubTopBar()
                LazyColumn(
                    Modifier.fillMaxSize().padding(start = 34.dp, end = 38.dp, bottom = 26.dp),
                    verticalArrangement = Arrangement.spacedBy(23.dp),
                ) {
                    item { Hero(selected) }
                    items(previewRows, key = { it.title }) { row ->
                        PreviewMediaRow(row, onFocused = { selected = it })
                    }
                }
            }
        }
    }
}

@Composable
private fun HubTopBar() {
    Row(
        Modifier.fillMaxWidth().height(70.dp).padding(horizontal = 35.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "BOLTBYTES",
            color = V1Colors.text,
            fontSize = 13.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 3.sp,
        )
        Text("  /  HJEM", color = V1Colors.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.weight(1f))
        V1Pill("ONLINE", emphasized = true)
        Spacer(Modifier.width(12.dp))
        Column(horizontalAlignment = Alignment.End) {
            Text("14:32", color = V1Colors.text, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Text("Lørdag 29. august", color = V1Colors.muted, fontSize = 10.sp)
        }
        Spacer(Modifier.width(14.dp))
        Box(
            Modifier
                .size(38.dp)
                .background(
                    Brush.linearGradient(listOf(Color(0xFF476C7A), Color(0xFF202B33))),
                    CircleShape,
                )
                .border(1.dp, Color.White.copy(alpha = 0.2f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text("H", color = V1Colors.text, fontSize = 14.sp, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun Hero(title: PreviewTitle) {
    Box(Modifier.fillMaxWidth().height(292.dp)) {
        Box(
            Modifier
                .align(Alignment.CenterEnd)
                .fillMaxHeight()
                .fillMaxWidth(0.58f)
                .background(
                    Brush.horizontalGradient(
                        listOf(Color.Transparent, title.colors.first().copy(alpha = 0.56f), title.colors.last()),
                    ),
                    RoundedCornerShape(25.dp),
                ),
        ) {
            Box(
                Modifier
                    .size(280.dp)
                    .align(Alignment.CenterEnd)
                    .offset(x = (-70).dp)
                    .background(Color.White.copy(alpha = 0.055f), CircleShape),
            )
            Text(
                title.title.take(2).uppercase(),
                modifier = Modifier.align(Alignment.CenterEnd).padding(end = 145.dp),
                color = Color.White.copy(alpha = 0.14f),
                fontSize = 108.sp,
                fontWeight = FontWeight.Black,
            )
        }
        Box(
            Modifier
                .fillMaxHeight()
                .fillMaxWidth(0.73f)
                .background(
                    Brush.horizontalGradient(
                        listOf(
                            V1Colors.background.copy(alpha = 0.98f),
                            V1Colors.background.copy(alpha = 0.78f),
                            Color.Transparent,
                        ),
                    ),
                ),
        )
        Column(
            Modifier.fillMaxHeight().fillMaxWidth(0.62f),
            verticalArrangement = Arrangement.Center,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                V1Pill("UDVALGT TIL DIG", emphasized = true)
                V1Pill("4K")
                V1Pill("HDR")
            }
            Spacer(Modifier.height(12.dp))
            Text(
                title.title,
                color = V1Colors.text,
                fontSize = 47.sp,
                lineHeight = 50.sp,
                fontWeight = FontWeight.Black,
            )
            Spacer(Modifier.height(3.dp))
            Text(
                title.eyebrow + "   ·   " + title.year + "   ·   16+   ·   52 min",
                color = V1Colors.muted,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "En mørk og intens fortælling, udvalgt på baggrund af din historik og klar til at fortsætte.",
                color = Color(0xFFD4DAE1),
                fontSize = 15.sp,
                lineHeight = 20.sp,
                maxLines = 2,
            )
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                V1Button("Fortsæt  ·  31:42", onClick = {})
                V1Button("Mere info", onClick = {}, secondary = true)
                V1Button("+ Min liste", onClick = {}, secondary = true)
            }
        }
    }
}

@Composable
private fun PreviewMediaRow(
    row: PreviewRow,
    onFocused: (PreviewTitle) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.width(4.dp).height(19.dp).background(V1Colors.gold, RoundedCornerShape(50)))
            Spacer(Modifier.width(10.dp))
            Text(row.title, color = V1Colors.text, fontSize = 20.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.width(12.dp))
            Text(
                if (row.shape == PreviewShape.LANDSCAPE) {
                    "Fortsæt på tværs af enheder"
                } else {
                    "Nyt i dit bibliotek"
                },
                color = V1Colors.muted,
                fontSize = 11.sp,
            )
            Spacer(Modifier.weight(1f))
            Text("Se alle  →", color = V1Colors.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            contentPadding = PaddingValues(8.dp),
        ) {
            items(row.items, key = { it.title }) { item ->
                if (row.shape == PreviewShape.LANDSCAPE) {
                    LandscapeCard(item, onFocused)
                } else {
                    PosterCard(item, onFocused)
                }
            }
        }
    }
}

@Composable
private fun LandscapeCard(
    item: PreviewTitle,
    onFocused: (PreviewTitle) -> Unit,
) {
    V1FocusSurface(
        onClick = {},
        modifier = Modifier.width(276.dp),
        radius = 16,
        onFocused = { onFocused(item) },
    ) { focused ->
        Box(
            Modifier
                .fillMaxWidth()
                .height(154.dp)
                .background(Brush.linearGradient(item.colors)),
        ) {
            Box(
                Modifier
                    .size(128.dp)
                    .align(Alignment.CenterEnd)
                    .offset(x = 18.dp)
                    .background(Color.White.copy(alpha = 0.06f), CircleShape),
            )
            Text(
                item.title.take(2).uppercase(),
                Modifier.align(Alignment.CenterEnd).padding(end = 37.dp),
                color = Color.White.copy(alpha = 0.22f),
                fontSize = 45.sp,
                fontWeight = FontWeight.Black,
            )
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Brush.horizontalGradient(listOf(Color(0xE814191F), Color.Transparent))),
            )
            Column(
                Modifier.align(Alignment.BottomStart).padding(start = 15.dp, end = 15.dp, bottom = 16.dp),
            ) {
                Text(
                    item.title,
                    color = V1Colors.text,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Black,
                    maxLines = 1,
                )
                Text(item.subtitle, color = Color(0xFFD3D9DF), fontSize = 11.sp, maxLines = 1)
            }
            if (focused) {
                Box(Modifier.padding(10.dp)) {
                    V1Pill("OK  Fortsæt", emphasized = true)
                }
            }
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(5.dp)
                    .background(Color(0x99505B66)),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(item.progress)
                        .height(5.dp)
                        .background(V1Colors.cyan),
                )
            }
        }
    }
}

@Composable
private fun PosterCard(
    item: PreviewTitle,
    onFocused: (PreviewTitle) -> Unit,
) {
    V1FocusSurface(
        onClick = {},
        modifier = Modifier.width(150.dp),
        radius = 16,
        onFocused = { onFocused(item) },
    ) { focused ->
        Column {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(205.dp)
                    .background(Brush.verticalGradient(item.colors)),
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.size(118.dp).background(Color.White.copy(alpha = 0.055f), CircleShape))
                Text(
                    item.title.take(2).uppercase(),
                    color = Color.White.copy(alpha = 0.78f),
                    fontSize = 36.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 2.sp,
                )
                item.badge?.let {
                    Box(
                        Modifier
                            .align(Alignment.TopEnd)
                            .padding(9.dp)
                            .background(V1Colors.gold, CircleShape)
                            .padding(horizontal = 9.dp, vertical = 5.dp),
                    ) {
                        Text(it, color = V1Colors.background, fontSize = 11.sp, fontWeight = FontWeight.Black)
                    }
                }
                Text(
                    item.eyebrow.uppercase(),
                    modifier = Modifier.align(Alignment.BottomStart).padding(10.dp),
                    color = Color.White.copy(alpha = 0.72f),
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                )
            }
            Column(Modifier.padding(horizontal = 10.dp, vertical = 9.dp)) {
                Text(
                    item.title,
                    color = V1Colors.text,
                    fontSize = 14.sp,
                    fontWeight = if (focused) FontWeight.Black else FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    item.subtitle + "  ·  " + item.year,
                    color = V1Colors.muted,
                    fontSize = 10.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun HubRail(onBackToLogin: () -> Unit) {
    val destinations = listOf(
        RailDestination(Icons.Default.Home, "Hjem"),
        RailDestination(Icons.Default.Movie, "Film"),
        RailDestination(Icons.Default.Tv, "Serier"),
        RailDestination(Icons.Default.LiveTv, "Live TV"),
        RailDestination(Icons.Default.Search, "Søg"),
        RailDestination(Icons.Default.Person, "Profil"),
    )
    Column(
        Modifier
            .width(84.dp)
            .fillMaxHeight()
            .background(Color(0xF2070A0E))
            .padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            Modifier
                .size(40.dp)
                .background(
                    Brush.linearGradient(listOf(V1Colors.gold, V1Colors.goldDeep)),
                    RoundedCornerShape(12.dp),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text("B", color = V1Colors.background, fontSize = 20.sp, fontWeight = FontWeight.Black)
        }
        Spacer(Modifier.height(20.dp))
        destinations.forEachIndexed { index, destination ->
            V1FocusSurface(
                onClick = {},
                modifier = Modifier.size(48.dp),
                radius = 13,
                scaleWhenFocused = 1.08f,
            ) { focused ->
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(
                            if (index == 0) V1Colors.gold.copy(alpha = 0.16f) else Color.Transparent,
                            RoundedCornerShape(12.dp),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        destination.icon,
                        contentDescription = destination.label,
                        tint = if (focused || index == 0) V1Colors.gold else V1Colors.muted,
                        modifier = Modifier.size(22.dp),
                    )
                }
            }
        }
        Spacer(Modifier.weight(1f))
        V1FocusSurface(
            onClick = onBackToLogin,
            modifier = Modifier.size(48.dp),
            radius = 13,
            scaleWhenFocused = 1.08f,
        ) { focused ->
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Icon(
                    Icons.Default.Logout,
                    contentDescription = "Tilbage til login",
                    tint = if (focused) V1Colors.gold else V1Colors.muted,
                    modifier = Modifier.size(21.dp),
                )
            }
        }
    }
}
