package com.boltbytes.media.tv.v1.ui

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ChildCare
import androidx.compose.material.icons.rounded.Lock
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class PreviewProfile(
    val name: String,
    val initials: String,
    val colors: List<Color>,
    val icon: ImageVector? = null,
    val locked: Boolean = false,
)

@Composable
fun ProfileVisualScreen(
    onSelectProfile: () -> Unit,
    onBack: () -> Unit,
) {
    val profiles = listOf(
        PreviewProfile("Henrik", "H", listOf(Color(0xFF36576A), Color(0xFF182630)), locked = true),
        PreviewProfile("Familien", "F", listOf(Color(0xFF715035), Color(0xFF2B1B13))),
        PreviewProfile("Børn", "", listOf(Color(0xFF2E6656), Color(0xFF112B24)), icon = Icons.Rounded.ChildCare),
        PreviewProfile("Ny profil", "", listOf(Color(0xFF303A45), Color(0xFF171C22)), icon = Icons.Rounded.Add),
    )
    var pinProfile by remember { mutableStateOf<PreviewProfile?>(null) }
    var pin by remember { mutableStateOf("") }

    BackHandler(enabled = pinProfile != null) {
        pinProfile = null
        pin = ""
    }

    V1AmbientBackground(accent = Color(0xFF253F4A)) {
        V1Glow(V1Colors.Cyan, 300.dp, Modifier.align(Alignment.TopEnd))
        V1ScreenHeader(
            section = "PROFILER",
            title = "BOLTBYTES",
            onBack = onBack,
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = 68.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Hvem ser med?",
                color = V1Colors.Text,
                fontSize = 31.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = (-0.6).sp,
            )
            Spacer(Modifier.height(7.dp))
            Text(
                text = "Din profil holder anbefalinger, historik og afspilning personlig.",
                color = V1Colors.Muted,
                fontSize = 11.sp,
            )
            Spacer(Modifier.height(30.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(17.dp)) {
                profiles.forEach { profile ->
                    V1FocusSurface(
                        onClick = {
                            if (profile.locked) {
                                pinProfile = profile
                                pin = ""
                            } else {
                                onSelectProfile()
                            }
                        },
                        onLongClick = {
                            pinProfile = profile
                            pin = ""
                        },
                        modifier = Modifier
                            .width(132.dp)
                            .height(166.dp),
                        radius = 18.dp,
                        focusedScale = 1.045f,
                        background = Brush.verticalGradient(
                            listOf(V1Colors.SurfaceSolid, Color(0xFF10151B)),
                        ),
                    ) { focused ->
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(14.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(78.dp)
                                    .background(Brush.linearGradient(profile.colors), CircleShape),
                                contentAlignment = Alignment.Center,
                            ) {
                                if (profile.icon != null) {
                                    Icon(
                                        profile.icon,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(31.dp),
                                    )
                                } else {
                                    Text(
                                        profile.initials,
                                        color = Color.White,
                                        fontSize = 29.sp,
                                        fontWeight = FontWeight.Black,
                                    )
                                }
                                if (profile.locked) {
                                    Box(
                                        modifier = Modifier
                                            .align(Alignment.BottomEnd)
                                            .size(23.dp)
                                            .background(V1Colors.Gold, CircleShape),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(
                                            Icons.Rounded.Lock,
                                            contentDescription = null,
                                            tint = V1Colors.Background,
                                            modifier = Modifier.size(12.dp),
                                        )
                                    }
                                }
                            }
                            Spacer(Modifier.height(13.dp))
                            Text(
                                profile.name,
                                color = if (focused) V1Colors.Gold else V1Colors.Text,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                if (profile.locked) "PIN-beskyttet" else "Vælg profil",
                                color = V1Colors.MutedSoft,
                                fontSize = 7.sp,
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(25.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Rounded.Lock, contentDescription = null, tint = V1Colors.MutedSoft, modifier = Modifier.size(12.dp))
                Text(
                    "Hold OK nede for profilindstillinger",
                    color = V1Colors.MutedSoft,
                    fontSize = 8.sp,
                    letterSpacing = 0.4.sp,
                )
            }
        }

        pinProfile?.let { profile ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.72f)),
                contentAlignment = Alignment.Center,
            ) {
                V1GlassPanel(
                    modifier = Modifier
                        .width(370.dp)
                        .height(350.dp),
                    radius = 24.dp,
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        V1Pill("PROFIL-PIN", color = V1Colors.Gold, emphasized = true)
                        Spacer(Modifier.height(12.dp))
                        Text(profile.name, color = V1Colors.Text, fontSize = 21.sp, fontWeight = FontWeight.Black)
                        Text("Indtast din 4-cifrede PIN", color = V1Colors.Muted, fontSize = 9.sp)
                        Spacer(Modifier.height(15.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            repeat(4) { index ->
                                Box(
                                    modifier = Modifier
                                        .size(19.dp)
                                        .background(
                                            if (index < pin.length) V1Colors.Gold else V1Colors.Elevated,
                                            CircleShape,
                                        ),
                                )
                            }
                        }
                        Spacer(Modifier.height(17.dp))
                        listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("Slet", "0", "OK")).forEach { row ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                row.forEach { key ->
                                    V1FocusSurface(
                                        onClick = {
                                            when (key) {
                                                "Slet" -> pin = pin.dropLast(1)
                                                "OK" -> if (pin.length == 4) onSelectProfile()
                                                else -> if (pin.length < 4) pin += key
                                            }
                                        },
                                        modifier = Modifier
                                            .weight(1f)
                                            .height(38.dp),
                                        radius = 11.dp,
                                    ) {
                                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                            Text(key, color = V1Colors.Text, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }
                            Spacer(Modifier.height(7.dp))
                        }
                    }
                }
            }
        }
    }
}
