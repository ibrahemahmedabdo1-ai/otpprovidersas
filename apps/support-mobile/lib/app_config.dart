import 'package:flutter/material.dart';
import 'home.dart';

class AppConfig {
  static const title = 'OTPProvider Support';
  static const roles = <String>['support_staff'];
  static const loginHint = 'Support staff only. Two-step verification is always required.';
}

Widget buildHome(BuildContext context, Map<String, dynamic> me, Future<void> Function() signOut) => Home(me: me, signOut: signOut);

List<Widget> registerLinks(BuildContext context) => const <Widget>[];
