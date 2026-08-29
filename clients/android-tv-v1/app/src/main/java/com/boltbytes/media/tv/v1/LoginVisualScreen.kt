package com.boltbytes.media.tv.v1

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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun LoginVisualScreen(onOpenHubPreview: () -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    V1AmbientBackground(
        accent = Color(0xFF274755),
        modifier = Modifier.fillMaxSize(),
    ) {
        V1Glow(
            V1Colors.goldDeep,
            Modifier.size(440.dp).offset(x = (-150).dp, y = 620.dp),
        )
        V1Glow(
            V1Colors.cyan,
            Modifier.size(480.dp).align(Alignment.TopEnd).offset(x = 180.dp, y = (-220).dp),
        )
        Row(Modifier.fillMaxSize().padding(horizontal = 62.dp, vertical = 43.dp)) {
            Column(
                Modifier.weight(0.55f).fillMaxHeight().padding(end = 58.dp),
                verticalArrangement = Arrangement.Center,
            ) {
                BrandLockup()
                Spacer(Modifier.height(35.dp))
                Text(
                    "Din biograf.\nDit hjem.",
                    color = V1Colors.text,
                    fontSize = 48.sp,
                    lineHeight = 51.sp,
                    fontWeight = FontWeight.Black,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    "Fortsæt præcis hvor du slap - på alle dine skærme.",
                    color = V1Colors.muted,
                    fontSize = 16.sp,
                )
                Spacer(Modifier.height(28.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    LoginField(email, { email = it }, "Email", false, Modifier.weight(1f))
                    LoginField(password, { password = it }, "Adgangskode", true, Modifier.weight(1f))
                }
                Spacer(Modifier.height(15.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                    V1Button("Log ind", onOpenHubPreview, Modifier.width(155.dp))
                    V1Button("Designpreview", onOpenHubPreview, secondary = true)
                }
                Spacer(Modifier.height(25.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    V1Pill("Fast sikker server", emphasized = true)
                    V1Pill("Krypteret session")
                    V1Pill("TV-optimeret")
                }
            }
            Box(
                Modifier
                    .width(1.dp)
                    .fillMaxHeight(0.83f)
                    .align(Alignment.CenterVertically)
                    .background(
                        Brush.verticalGradient(
                            listOf(Color.Transparent, V1Colors.border, Color.Transparent),
                        ),
                    ),
            )
            Box(
                Modifier.weight(0.45f).fillMaxHeight().padding(start = 57.dp),
                contentAlignment = Alignment.Center,
            ) {
                V1GlassPanel(Modifier.fillMaxWidth().height(545.dp)) {
                    Column(
                        Modifier.fillMaxSize().padding(34.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Row(
                            Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "Log ind med telefonen",
                                    color = V1Colors.text,
                                    fontSize = 25.sp,
                                    fontWeight = FontWeight.Black,
                                )
                                Text(
                                    "Scan og godkend på få sekunder",
                                    color = V1Colors.muted,
                                    fontSize = 13.sp,
                                )
                            }
                            Row(
                                Modifier
                                    .background(V1Colors.green.copy(alpha = 0.12f), CircleShape)
                                    .padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Box(Modifier.size(7.dp).background(V1Colors.green, CircleShape))
                                Text("Klar", color = V1Colors.green, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                        Spacer(Modifier.height(24.dp))
                        Box(
                            Modifier
                                .size(254.dp)
                                .background(Color.White, RoundedCornerShape(22.dp))
                                .border(1.dp, Color.White.copy(alpha = 0.5f), RoundedCornerShape(22.dp))
                                .padding(16.dp),
                        ) {
                            QrPreview(Modifier.fillMaxSize())
                            Box(
                                Modifier
                                    .size(42.dp)
                                    .align(Alignment.Center)
                                    .background(V1Colors.background, RoundedCornerShape(11.dp)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text("BB", color = V1Colors.gold, fontSize = 12.sp, fontWeight = FontWeight.Black)
                            }
                        }
                        Spacer(Modifier.height(17.dp))
                        Text(
                            "BB-TV-V1",
                            color = V1Colors.gold,
                            fontSize = 23.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 4.sp,
                        )
                        Text("Koden udløber om 04:58", color = V1Colors.muted, fontSize = 11.sp)
                        Spacer(Modifier.height(17.dp))
                        V1Button("Generér ny kode", onClick = {}, secondary = true)
                    }
                }
            }
        }
        Text(
            "V1 VISUAL SYSTEM  ·  DESIGNPREVIEW",
            modifier = Modifier.align(Alignment.BottomStart).padding(start = 62.dp, bottom = 18.dp),
            color = V1Colors.mutedSoft,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 2.sp,
        )
    }
}

@Composable
private fun BrandLockup() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(
            Modifier
                .size(37.dp)
                .background(
                    Brush.linearGradient(listOf(V1Colors.gold, V1Colors.goldDeep)),
                    RoundedCornerShape(11.dp),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text("B", color = V1Colors.background, fontSize = 19.sp, fontWeight = FontWeight.Black)
        }
        Column {
            Text(
                "BOLTBYTES",
                color = V1Colors.text,
                fontSize = 15.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 3.sp,
            )
            Text(
                "MEDIA",
                color = V1Colors.gold,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 4.sp,
            )
        }
    }
}

@Composable
private fun LoginField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    password: Boolean,
    modifier: Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        modifier = modifier,
        visualTransformation = if (password) {
            PasswordVisualTransformation()
        } else {
            androidx.compose.ui.text.input.VisualTransformation.None
        },
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = Color(0x99151B22),
            unfocusedContainerColor = Color(0x77151B22),
            focusedBorderColor = V1Colors.gold,
            unfocusedBorderColor = V1Colors.border,
            focusedTextColor = V1Colors.text,
            unfocusedTextColor = V1Colors.text,
            focusedLabelColor = V1Colors.gold,
            unfocusedLabelColor = V1Colors.muted,
            cursorColor = V1Colors.gold,
        ),
    )
}

@Composable
private fun QrPreview(modifier: Modifier) {
    val cells = 19
    Column(modifier, verticalArrangement = Arrangement.SpaceBetween) {
        repeat(cells) { y ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                repeat(cells) { x ->
                    val finder = (x < 6 && y < 6) ||
                        (x > 12 && y < 6) ||
                        (x < 6 && y > 12)
                    val marker = finder || ((x * 7 + y * 11 + x * y) % 7 < 3)
                    Box(
                        Modifier
                            .size(8.dp)
                            .background(if (marker) V1Colors.background else Color.Transparent),
                    )
                }
            }
        }
    }
}

