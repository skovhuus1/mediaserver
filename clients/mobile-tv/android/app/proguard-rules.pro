# Room creates generated database implementations through reflection. Room 2.6.1's
# consumer rule keeps the implementation class name, but does not retain its no-arg
# constructor under current R8 full-mode optimization.
-keepclassmembers class * extends androidx.room.RoomDatabase {
    <init>();
}

# WorkManager is initialized by AndroidX Startup before Flutter/MainActivity. Keep
# its generated database and constructor explicitly so a release APK cannot crash
# in InitializationProvider before the first frame.
-keep class androidx.work.impl.WorkDatabase_Impl {
    <init>();
}
