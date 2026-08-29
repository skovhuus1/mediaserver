package com.boltbytes.media.tv.v1.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.Tv
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class GenrePreview(
    val title: String,
    val type: String,
    val count: Int,
    val description: String,
    val colors: List<Color>,
)

@Composable
fun GenreVisualScreen(
    onBack: () -> Unit,
    onOpenMovies: () -> Unit,
    onOpenSeries: () -> Unit,
) {
    val genres = listOf(
        GenrePreview("Krimi", "FILM OG SERIER", 84, "Mørke mysterier, stærke karakterer og sager, der skal løses.", listOf(Color(0xFF173C49), Color(0xFF762E3D), Color(0xFF0B1117))),
        GenrePreview("Drama", "FILM OG SERIER", 126, "Store fortællinger om valg, relationer og konsekvenser.", listOf(Color(0xFF60354A), Color(0xFFC27277), Color(0xFF160D12))),
        GenrePreview("Dokumentar", "FILM", 53, "Virkelige historier fortalt tæt, ærligt og visuelt.", listOf(Color(0xFF57462D), Color(0xFFC49752), Color(0xFF171108))),
        GenrePreview("Action", "FILM OG SERIER", 67, "Højt tempo, store konflikter og kompromisløs underholdning.", listOf(Color(0xFF63212A), Color(0xFFD94A38), Color(0xFF19090B))),
        GenrePreview("Familie", "FILM", 42, "Noget for hele familien, samlet ét trygt sted.", listOf(Color(0xFF245A52), Color(0xFF55B394), Color(0xFF091613))),
        GenrePreview("Sci-fi", "FILM OG SERIER", 38, "Nye verdener, fremtidens teknologi og det ukendte.", listOf(Color(0xFF153E55), Color(0xFF4B86B8), Color(0xFF071218))),
        GenrePreview("Komedie", "FILM OG SERIER", 71, "Skarp humor, varme øjeblikke og historier med overskud.", listOf(Color(0xFF6B4C20), Color(0xFFE0A93F), Color(0xFF1A1208))),
        GenrePreview("Thriller", "FILM", 49, "Spænding, hemmeligheder og fortællinger uden sikre svar.", listOf(Color(0xFF34304F), Color(0xFF7969A5), Color(0xFF0E0B16))),
    )
    var selectedIndex by remember { mutableIntStateOf(0) }
    val selected = genres[selectedIndex]

    V1AmbientBackground(accent = selected.colors.first()) {
        Column(modifier = Modifier.fillMaxSize()) {
            V1ScreenHeader(
                section = "DISCOVERY",
                title = "GENRE",
                onBack = onBack,
                trailing = { V1StatusDot("${genres.sumOf { it.count }} TITLER", V1Colors.Cyan) },
            )

            V1GlassPanel(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(118.dp)
                    .padding(horizontal = 25.dp, vertical = 7.dp),
                radius = 19.dp,
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Brush.horizontalGradient(listOf(Color(0xF00A0E12), selected.colors[1].copy(alpha = 0.42f)))),
                )
                Column(
                    modifier = Modifier
                        .align(Alignment.CenterStart)
                        .padding(horizontal = 23.dp),
                ) {
                    V1Pill(selected.type, color = V1Colors.Gold, emphasized = true)
                    Spacer(Modifier.height(7.dp))
                    Text(selected.title, color = V1Colors.Text, fontSize = 27.sp, fontWeight = FontWeight.Black)
                    Text(selected.description, color = V1Colors.Muted, fontSize = 9.sp)
                }
                Text(
                    "${selected.count}",
                    color = Color.White.copy(alpha = 0.12f),
                    fontSize = 64.sp,
                    fontWeight = FontWeight.Black,
                    modifier = Modifier.align(Alignment.CenterEnd).padding(end = 28.dp),
                )
            }

            V1SectionTitle(
                title = "Udforsk efter stemning",
                subtitle = "Store samlinger, ikke små chips",
                modifier = Modifier.padding(horizontal = 25.dp, vertical = 8.dp),
            )
            LazyVerticalGrid(
                columns = GridCells.Fixed(4),
                modifier = Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 25.dp, vertical = 3.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                itemsIndexed(genres) { index, genre ->
                    V1FocusSurface(
                        onClick = { if (genre.type == "FILM") onOpenMovies() else onOpenSeries() },
                        modifier = Modifier.fillMaxWidth().height(102.dp),
                        radius = 16.dp,
                        onFocused = { selectedIndex = index },
                        background = Brush.linearGradient(genre.colors),
                    ) { focused ->
                        Box(Modifier.fillMaxSize()) {
                            Row(
                                modifier = Modifier.align(Alignment.TopStart).padding(13.dp),
                                horizontalArrangement = Arrangement.spacedBy(7.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    if (genre.type == "FILM") Icons.Rounded.Movie else Icons.Rounded.Tv,
                                    contentDescription = null,
                                    tint = if (focused) V1Colors.Gold else Color.White.copy(alpha = 0.74f),
                                )
                                Text(genre.type, color = Color.White.copy(alpha = 0.72f), fontSize = 7.sp, fontWeight = FontWeight.Bold)
                            }
                            Column(Modifier.align(Alignment.BottomStart).padding(13.dp)) {
                                Text(genre.title, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Black)
                                Text("${genre.count} titler", color = Color.White.copy(alpha = 0.66f), fontSize = 7.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}
