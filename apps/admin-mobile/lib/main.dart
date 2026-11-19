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
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0E9F6E)), useMaterial3: true),
      darkTheme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF22D39A), brightness: Brightness.dark), useMaterial3: true),
      home: const Gate(),
    );
  }
}
