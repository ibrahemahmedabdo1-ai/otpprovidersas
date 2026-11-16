import 'package:flutter/material.dart';
import 'core.dart';
import 'home.dart';

class AppConfig {
  static const title = 'OTPProvider';
  static const roles = <String>['customer'];
  static const loginHint = 'Sandbox only. Live sending is not enabled yet and nothing here charges you.';
}

Widget buildHome(BuildContext context, Map<String, dynamic> me, Future<void> Function() signOut) => Home(me: me, signOut: signOut);

List<Widget> registerLinks(BuildContext context) => [
      TextButton(onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const RegisterScreen())), child: const Text('Create an account')),
    ];
