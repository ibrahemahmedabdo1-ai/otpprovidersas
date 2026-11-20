import 'package:flutter/material.dart';
import 'app_config.dart';
import 'core.dart';

void main() => runApp(const App());

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.title,
      theme: brandTheme(Brightness.light),
      darkTheme: brandTheme(Brightness.dark),
      themeMode: ThemeMode.dark,
      home: const Gate(),
    );
  }
}


/// Matches the website and web consoles: deep teal surfaces, emerald accent, pill buttons, bordered rounded cards.
ThemeData brandTheme(Brightness b) {
  final dark = b == Brightness.dark;
  final accent = dark ? const Color(0xFF22D39A) : const Color(0xFF0E9F6E);
  final bg = dark ? const Color(0xFF06141A) : const Color(0xFFF4FAF8);
  final card = dark ? const Color(0xFF0C2228) : Colors.white;
  final line = dark ? const Color(0xFF1B3A41) : const Color(0xFFD5E8E2);
  final scheme = ColorScheme.fromSeed(seedColor: accent, brightness: b).copyWith(primary: accent, surface: card, onPrimary: const Color(0xFF04251B));
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: bg,
    appBarTheme: AppBarTheme(backgroundColor: bg, foregroundColor: dark ? Colors.white : const Color(0xFF06141A), elevation: 0, scrolledUnderElevation: 0),
    drawerTheme: DrawerThemeData(backgroundColor: card),
    cardTheme: CardThemeData(color: card, elevation: 0, margin: const EdgeInsets.only(bottom: 10), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: line))),
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(shape: const StadiumBorder(), padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14), foregroundColor: const Color(0xFF04251B))),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(shape: const StadiumBorder(), side: BorderSide(color: line))),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: accent)),
    inputDecorationTheme: InputDecorationTheme(border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: line)), enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: line))),
  );
}
