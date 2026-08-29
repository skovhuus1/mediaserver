package com.boltbytes.media.tv.v1.ui

import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Email
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun LoginVisualScreen(
    onLogin: (() -> Unit)? = null,
    onAuthenticated: (() -> Unit)? = null,
    onContinue: (() -> Unit)? = null,
    onOpenHub: (() -> Unit)? = null,
) {
    val openHub = onLogin ?: onAuthenticated ?: onContinue ?: onOpenHub ?: {}

    V1AmbientBackground(accent = Color(0xFF274755)) {
        V1Glow(
            color = V1Colors.Cyan,
            size = 420.dp,
            modifier = Modifier.align(Alignment.TopEnd),
        )
        V1Glow(
            color = V1Colors.Gold,
            size = 330.dp,
            modifier = Modifier.align(Alignment.BottomStart),
        )

        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 54.dp, vertical = 32.dp),
            horizontalArrangement = Arrangement.spacedBy(34.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                modifier = Modifier
                    .weight(1.08f)
                    .fillMaxHeight(),
                verticalArrangement = Arrangement.Center,
            ) {
                BrandLockup()
                Spacer(Modifier.height(23.dp))

                Text(
                    text = "Din biograf.\nDit hjem.",
                    color = V1Colors.Text,
                    fontSize = 40.sp,
                    lineHeight = 42.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = (-1.4).sp,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "Alt dit indhold samlet i en hurtig og personlig TV-oplevelse.",
                    color = V1Colors.Muted,
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                )
                Spacer(Modifier.height(20.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    LoginField(
                        label = "E-MAIL",
                        value = "navn@eksempel.dk",
                        icon = Icons.Rounded.Email,
                        modifier = Modifier.weight(1f),
                    )
                    LoginField(
                        label = "ADGANGSKODE",
                        value = "••••••••••••",
                        icon = Icons.Rounded.Lock,
                        modifier = Modifier.weight(0.78f),
                    )
                }
                Spacer(Modifier.height(12.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    V1Button(
                        label = "Log ind",
                        onClick = openHub,
                        primary = true,
                        icon = Icons.Rounded.ArrowForward,
                    )
                    V1Button(label = "Glemt adgangskode", onClick = {})
                }
                Spacer(Modifier.height(14.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    V1Pill("FAST SIKKER SERVER", color = V1Colors.Green, dot = V1Colors.Green)
                    V1Pill("KRYPTERET SESSION", color = V1Colors.Cyan, dot = V1Colors.Cyan)
                    V1Pill("TV-OPTIMERET", color = V1Colors.Gold, dot = V1Colors.Gold)
                }
            }

            Box(
                modifier = Modifier
                    .width(1.dp)
                    .fillMaxHeight(0.9f)
                    .background(
                        Brush.verticalGradient(
                            listOf(Color.Transparent, Color.White.copy(alpha = 0.18f), Color.Transparent),
                        ),
                    ),
            )

            V1GlassPanel(
                modifier = Modifier
                    .weight(0.62f)
                    .fillMaxHeight(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 28.dp, vertical = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(V1Colors.Cyan.copy(alpha = 0.13f)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.PhoneAndroid,
                                    contentDescription = null,
                                    tint = V1Colors.Cyan,
                                    modifier = Modifier.size(17.dp),
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Log ind med telefonen",
                                    color = V1Colors.Text,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    text = "Scan. Bekræft. Se med det samme.",
                                    color = V1Colors.Muted,
                                    fontSize = 9.sp,
                                )
                            }
                        }
                        V1Pill("KLAR", color = V1Colors.Green, emphasized = true, dot = V1Colors.Green)
                    }

                    Spacer(Modifier.weight(0.5f))
                    QrPreview(modifier = Modifier.size(158.dp))
                    Spacer(Modifier.height(11.dp))
                    Text(
                        text = "BB-TV-V1",
                        color = V1Colors.Text,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 3.sp,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Koden udløber om 04:42",
                        color = V1Colors.Muted,
                        fontSize = 9.sp,
                    )
                    Spacer(Modifier.height(10.dp))
                    V1Button(
                        label = "Generér ny kode",
                        onClick = {},
                        icon = Icons.Rounded.Refresh,
                    )
                    Spacer(Modifier.weight(0.5f))
                    Text(
                        text = "Godkend login på din telefon. Begge loginmetoder er altid tilgængelige.",
                        color = V1Colors.MutedSoft,
                        fontSize = 8.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        Text(
            text = "BOLTBYTES MEDIA  ·  SIKKER TV-SESSION  ·  MEDIA.BOLTBYTES.COM",
            color = V1Colors.MutedSoft,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.8.sp,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 55.dp, bottom = 13.dp),
        )
    }
}

@Composable
private fun BrandLockup() {
    Row(
        horizontalArrangement = Arrangement.spacedBy(13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(11.dp))
                .background(Brush.linearGradient(listOf(V1Colors.Gold, Color(0xFFFFE891)))),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "B",
                color = V1Colors.Background,
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
            )
        }
        Column {
            Text(
                text = "BOLTBYTES",
                color = V1Colors.Text,
            fontSize = 14.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 1.9.sp,
            )
            Text(
                text = "MEDIA  ·  TV V1",
                color = V1Colors.Gold,
                fontSize = 8.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 2.2.sp,
            )
        }
    }
}

@Composable
private fun LoginField(
    label: String,
    value: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
) {
    V1FocusSurface(
        onClick = {},
        modifier = modifier.height(58.dp),
        radius = 13.dp,
        focusedScale = 1.012f,
    ) { focused ->
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 13.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (focused) V1Colors.Gold else V1Colors.Muted,
                modifier = Modifier.size(16.dp),
            )
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = label,
                    color = if (focused) V1Colors.Gold else V1Colors.MutedSoft,
                    fontSize = 8.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.2.sp,
                )
                Text(
                    text = value,
                    color = V1Colors.Text,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun QrPreview(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .background(Color.White)
            .border(5.dp, Color.White.copy(alpha = 0.9f), RoundedCornerShape(18.dp))
            .padding(11.dp),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val cells = 25
            val unit = size.minDimension / cells

            fun finder(left: Int, top: Int) {
                drawRect(
                    color = V1Colors.Background,
                    topLeft = Offset(left * unit, top * unit),
                    size = Size(7 * unit, 7 * unit),
                )
                drawRect(
                    color = Color.White,
                    topLeft = Offset((left + 1) * unit, (top + 1) * unit),
                    size = Size(5 * unit, 5 * unit),
                )
                drawRect(
                    color = V1Colors.Background,
                    topLeft = Offset((left + 2) * unit, (top + 2) * unit),
                    size = Size(3 * unit, 3 * unit),
                )
            }

            for (y in 0 until cells) {
                for (x in 0 until cells) {
                    val insideFinder =
                        (x < 8 && y < 8) || (x >= cells - 8 && y < 8) || (x < 8 && y >= cells - 8)
                    val active = ((x * 7 + y * 11 + x * y) % 9) < 4
                    if (!insideFinder && active) {
                        drawRect(
                            color = V1Colors.Background,
                            topLeft = Offset(x * unit, y * unit),
                            size = Size(unit * 0.9f, unit * 0.9f),
                        )
                    }
                }
            }
            finder(0, 0)
            finder(cells - 7, 0)
            finder(0, cells - 7)
        }

        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(9.dp))
                .background(V1Colors.Gold)
                .border(3.dp, Color.White, RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "BB",
                color = V1Colors.Background,
                fontSize = 9.sp,
                fontWeight = FontWeight.Black,
            )
        }
    }
}
