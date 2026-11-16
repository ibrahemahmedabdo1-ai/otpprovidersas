import 'package:flutter/material.dart';
import 'home.dart';

class AppConfig {
  static const title = 'OTPProvider Admin';
  static const roles = <String>['admin_staff', 'super_admin'];
  static const loginHint = 'Staff only. Two-step verification is always required.';
}

Widget buildHome(BuildContext context, Map<String, dynamic> me, Future<void> Function() signOut) => Home(me: me, signOut: signOut);

List<Widget> registerLinks(BuildContext context) => const <Widget>[];
