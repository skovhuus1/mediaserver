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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.PlayArrow
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class PreviewChannel(
    val number: String,
    val name: String,
    val mark: String,
    val color: Color,
    val programs: List<String>,
)

@Composable
fun LiveTvVisualScreen(
    onBack: () -> Unit,
    onPlay: () -> Unit,
) {
    val channels = listOf(
        PreviewChannel("1", "DR1", "DR", Color(0xFFDA3344), listOf("TV Avisen", "Aftenshowet", "Horisont")),
        PreviewChannel("2", "TV 2", "2", Color(0xFF2867C7), listOf("Nyhederne", "Go' aften Live", "Stormester")),
        PreviewChannel("3", "DR2", "D2", Color(0xFF4C8C77), listOf("Deadline", "Kulturmagasinet", "Dokumentar")),
        PreviewChannel("4", "TV3", "3", Color(0xFFB7476C), listOf("Luksusfælden", "Paradise", "NCIS")),
        PreviewChannel("5", "KANAL 5", "K5", Color(0xFF8B6EC1), listOf("Politijagt", "Krimi", "Film")),
        PreviewChannel("6", "NEWS", "N", Color(0xFFD18B32), listOf("News & Co.", "Business", "Presselogen")),
        PreviewChannel("7", "SPORT", "S", Color(0xFF3A9C68), listOf("Optakt", "Superliga", "Sportsmagasinet")),
    )
    var selectedChannel by remember { mutableIntStateOf(0) }
    var selectedProgram by remember { mutableIntStateOf(0) }
    var favorites by remember { mutableStateOf(setOf("DR1")) }
    var message by remember { mutableStateOf<String?>(null) }
    val selected = channels[selectedChannel]

    V1AmbientBackground(accent = selected.color) {
        Column(modifier = Modifier.fillMaxSize()) {
            V1ScreenHeader(
                section = "12-TIMERS GUIDE",
                title = "LIVE TV",
                onBack = onBack,
                trailing = {
                    Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        V1StatusDot("LIVE", V1Colors.Danger)
                        V1StatusDot("GUIDE OPDATERET", V1Colors.Green)
                    }
                },
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(108.dp)
                    .background(
                        Brush.horizontalGradient(
                            listOf(Color(0xF0141A20), selected.color.copy(alpha = 0.28f)),
                        ),
                    )
                    .padding(horizontal = 25.dp, vertical = 13.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(15.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .width(72.dp)
                            .fillMaxHeight()
                            .background(selected.color.copy(alpha = 0.22f), RoundedCornerShape(14.dp))
                            .border(1.dp, selected.color.copy(alpha = 0.5f), RoundedCornerShape(14.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(selected.mark, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Black)
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            V1Pill("NU", color = V1Colors.Danger, emphasized = true, dot = V1Colors.Danger)
                            Text(selected.name, color = V1Colors.Muted, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                        }
                        Text(
                            selected.programs[selectedProgram],
                            color = V1Colors.Text,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.ExtraBold,
                        )
                        Text(
                            if (selectedProgram == 0) "20:00 – 20:30  ·  18 min. tilbage" else "Starter kl. ${20 + selectedProgram}:00",
                            color = V1Colors.Muted,
                            fontSize = 8.sp,
                        )
                        Text(
                            "Direkte nyheder, aktuelle historier og aftenens vigtigste overblik.",
                            color = V1Colors.MutedSoft,
                            fontSize = 8.sp,
                        )
                    }
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    V1Button("Se live", onClick = onPlay, primary = true, icon = Icons.Rounded.PlayArrow)
                    V1Button(
                        if (selected.name in favorites) "Favorit" else "Tilføj favorit",
                        onClick = {
                            favorites = if (selected.name in favorites) favorites - selected.name else favorites + selected.name
                            message = if (selected.name in favorites) "${selected.name} er tilføjet som favorit" else "${selected.name} er fjernet fra favoritter"
                        },
                        icon = Icons.Rounded.Favorite,
                    )
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(28.dp)
                    .background(Color(0xFF11171D))
                    .border(1.dp, Color.White.copy(alpha = 0.06f)),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .width(126.dp)
                        .fillMaxHeight()
                        .background(Color(0xFF0C1116))
                        .padding(horizontal = 14.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    Text("KANALER", color = V1Colors.MutedSoft, fontSize = 7.sp, fontWeight = FontWeight.Bold)
                }
                listOf("20:00", "20:30", "21:00", "21:30").forEach {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .border(0.5.dp, Color.White.copy(alpha = 0.06f)),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        Text(it, color = V1Colors.Muted, fontSize = 7.sp, modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }

            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(channels.size) { channelIndex ->
                    val channel = channels[channelIndex]
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(45.dp),
                    ) {
                        Row(
                            modifier = Modifier
                                .width(126.dp)
                                .fillMaxHeight()
                                .background(if (selectedChannel == channelIndex) Color(0xFF1E2831) else Color(0xFF0D1217))
                                .border(0.5.dp, Color.White.copy(alpha = 0.07f))
                                .padding(horizontal = 10.dp),
                            horizontalArrangement = Arrangement.spacedBy(9.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(channel.number, color = V1Colors.MutedSoft, fontSize = 7.sp)
                            Box(
                                modifier = Modifier
                                    .width(31.dp)
                                    .height(25.dp)
                                    .background(channel.color.copy(alpha = 0.22f), RoundedCornerShape(7.dp)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(channel.mark, color = Color.White, fontSize = 8.sp, fontWeight = FontWeight.Black)
                            }
                            Text(channel.name, color = V1Colors.Text, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                        }

                        channel.programs.forEachIndexed { programIndex, program ->
                            V1FocusSurface(
                                onClick = {
                                    if (programIndex == 0) {
                                        onPlay()
                                    } else {
                                        message = "${channel.programs[programIndex]} starter senere"
                                    }
                                },
                                modifier = Modifier
                                    .weight(if (programIndex == 1) 1.28f else 1f)
                                    .fillMaxHeight(),
                                radius = 0.dp,
                                focusedScale = 1f,
                                background = Brush.horizontalGradient(
                                    listOf(
                                        if (programIndex == 0) channel.color.copy(alpha = 0.19f) else Color(0xFF171D23),
                                        Color(0xFF13191F),
                                    ),
                                ),
                                onFocused = {
                                    selectedChannel = channelIndex
                                    selectedProgram = programIndex
                                },
                            ) { focused ->
                                Column(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(horizontal = 8.dp, vertical = 6.dp),
                                    verticalArrangement = Arrangement.Center,
                                ) {
                                    Text(
                                        program,
                                        color = if (focused) V1Colors.Gold else V1Colors.Text,
                                        fontSize = 8.sp,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Spacer(Modifier.height(2.dp))
                                    Text(
                                        if (programIndex == 0) "20:00 · LIVE" else "${20 + programIndex}:00",
                                        color = V1Colors.MutedSoft,
                                        fontSize = 6.sp,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        message?.let {
            V1Toast(it, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 18.dp))
        }
    }
}
