// Shared client core (identical in all three apps): API client, session gate, login and MFA screens.
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'app_config.dart';

const apiBase = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:3001');

class ApiResult {
  final int status;
  final dynamic data;
  final bool network;
  ApiResult(this.status, this.data, {this.network = false});
  bool get ok => status >= 200 && status < 300;
  Map<String, dynamic> get map => data is Map<String, dynamic> ? data as Map<String, dynamic> : <String, dynamic>{};
  List<dynamic> get list => data is List ? data as List<dynamic> : <dynamic>[];
}

class Api {
  static const _store = FlutterSecureStorage();
  static String? _token;

  static Future<void> load() async {
    try { _token = await _store.read(key: 'session'); } catch (_) { _token = null; }
  }

  static Future<void> setToken(String? t) async {
    _token = t;
    try {
      if (t == null) { await _store.delete(key: 'session'); } else { await _store.write(key: 'session', value: t); }
    } catch (_) {/* secure storage unavailable: session lives in memory only */}
  }

  static Future<ApiResult> call(String method, String path, {Object? body}) async {
    final req = http.Request(method, Uri.parse('$apiBase$path'));
    req.headers['x-client-type'] = 'mobile';
    if (_token != null) req.headers['authorization'] = 'Bearer $_token';
    if (body != null) { req.headers['content-type'] = 'application/json'; req.body = jsonEncode(body); }
    try {
      final res = await http.Response.fromStream(await req.send().timeout(const Duration(seconds: 20)));
      dynamic data;
      if (res.body.isNotEmpty) { try { data = jsonDecode(res.body); } catch (_) { data = null; } }
      return ApiResult(res.statusCode, data);
    } catch (_) {
      return ApiResult(0, null, network: true);
    }
  }

  static Future<ApiResult> get(String p) => call('GET', p);
  static Future<ApiResult> post(String p, [Object? b]) => call('POST', p, body: b);
}

const _messages = <String, String>{
  'invalid_credentials': 'The email or password is incorrect.',
  'email_not_verified': 'Verify your email first, using the link we sent you.',
  'account_disabled': 'This account is disabled.',
  'rate_limited': 'Too many attempts. Wait a few minutes and try again.',
  'locked': 'Too many failed attempts. Wait about 15 minutes.',
  'validation_failed': 'Some of the details are not valid.',
  'unauthenticated': 'Your session has ended. Sign in again.',
  'forbidden': 'Your role is not allowed to do that.',
  'super_admin_approval_required': 'A Super Admin approval is required first. Use Request approval.',
  'receipt_verification_required': 'A receipt verification note is required.',
  'deposit_not_open': 'This deposit is no longer open.',
  'too_many_open_deposits': 'You already have open top-up requests. Wait until they are reviewed.',
  'name_taken': 'You already have a project with that name.',
  'project_limit_reached': 'You reached the maximum number of projects.',
  'invalid_code': 'That code is not correct.',
  'not_found': 'Not found.',
};

String errorText(ApiResult r) {
  if (r.network) return 'Could not reach the service. Check your connection.';
  final code = r.map['error'];
  if (code is String && _messages.containsKey(code)) return _messages[code]!;
  if (r.status == 401) return _messages['unauthenticated']!;
  if (r.status == 429) return _messages['rate_limited']!;
  return 'Something went wrong. Try again.';
}

String usd(dynamic v) {
  final s = '$v';
  final p = s.split('.');
  final frac = ('${p.length > 1 ? p[1] : ''}00').substring(0, 2);
  return '\$${p[0]}.$frac';
}

class Banner2 extends StatelessWidget {
  final String text;
  final bool ok;
  const Banner2(this.text, {super.key, this.ok = false});
  @override
  Widget build(BuildContext context) {
    final c = ok ? Colors.green : Theme.of(context).colorScheme.error;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), border: Border.all(color: c), borderRadius: BorderRadius.circular(8)),
      child: Text(text, semanticsLabel: text),
    );
  }
}

/// Decides what to show: login, MFA, wrong-role notice, or the signed-in home.
class Gate extends StatefulWidget {
  const Gate({super.key});
  @override
  State<Gate> createState() => _GateState();
}

class _GateState extends State<Gate> {
  Map<String, dynamic>? me;
  bool loading = true;
  bool enroll = false;

  @override
  void initState() { super.initState(); _refresh(); }

  Future<void> _refresh() async {
    await Api.load();
    ApiResult r = ApiResult(401, null);
    if (Api._token != null) r = await Api.get('/v1/auth/me');
    if (!mounted) return;
    setState(() { me = r.ok ? r.map : null; loading = false; });
  }

  Future<void> signOut() async {
    await Api.post('/v1/auth/logout');
    await Api.setToken(null);
    if (!mounted) return;
    setState(() { me = null; enroll = false; });
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final m = me;
    if (m == null) {
      return LoginScreen(onDone: (needsEnroll) { enroll = needsEnroll; _refresh(); });
    }
    if (m['mfaPending'] == true) {
      return MfaScreen(enroll: enroll, email: '${m['email']}', onDone: _refresh, onSignOut: signOut);
    }
    if (!AppConfig.roles.contains(m['role'])) {
      return Scaffold(
        appBar: AppBar(title: Text(AppConfig.title)),
        body: Padding(padding: const EdgeInsets.all(24), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Banner2('This account (${m['role']}) is not allowed in the ${AppConfig.title} app. Sign out and use the right app.'),
          FilledButton(onPressed: signOut, child: const Text('Sign out')),
        ])),
      );
    }
    return buildHome(context, m, signOut);
  }
}

class LoginScreen extends StatefulWidget {
  final void Function(bool needsEnroll) onDone;
  const LoginScreen({super.key, required this.onDone});
  @override
  State<LoginScreen> createState() => _LoginState();
}

class _LoginState extends State<LoginScreen> {
  final email = TextEditingController();
  final pass = TextEditingController();
  bool busy = false;
  String err = '';

  Future<void> submit() async {
    setState(() { busy = true; err = ''; });
    final r = await Api.post('/v1/auth/login', {'email': email.text.trim(), 'password': pass.text});
    if (!mounted) return;
    if (r.ok && r.map['token'] is String) {
      await Api.setToken(r.map['token'] as String);
      final mfa = r.map['mfa'];
      widget.onDone(mfa is Map && mfa['required'] == true && mfa['enrolled'] != true);
      return;
    }
    setState(() { busy = false; err = r.ok ? 'Sign-in did not return a session. Try again.' : errorText(r); });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(AppConfig.title)),
      body: ListView(padding: const EdgeInsets.all(24), children: [
        Text('Sign in', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 4),
        Text(AppConfig.loginHint),
        const SizedBox(height: 16),
        if (err.isNotEmpty) Banner2(err),
        TextField(controller: email, keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.username], decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder())),
        const SizedBox(height: 12),
        TextField(controller: pass, obscureText: true, autofillHints: const [AutofillHints.password], decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder())),
        const SizedBox(height: 16),
        FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'Signing in' : 'Sign in')),
        ...registerLinks(context),
      ]),
    );
  }
}

class MfaScreen extends StatefulWidget {
  final bool enroll;
  final String email;
  final Future<void> Function() onDone;
  final Future<void> Function() onSignOut;
  const MfaScreen({super.key, required this.enroll, required this.email, required this.onDone, required this.onSignOut});
  @override
  State<MfaScreen> createState() => _MfaState();
}

class _MfaState extends State<MfaScreen> {
  late bool enrolling = widget.enroll;
  String? secret;
  List<String>? codes;
  bool saved = false;
  bool recovery = false;
  bool busy = false;
  String err = '';
  final code = TextEditingController();

  @override
  void initState() { super.initState(); if (enrolling) _setup(); }

  Future<void> _setup() async {
    setState(() { busy = true; err = ''; });
    final r = await Api.post('/v1/auth/mfa/setup');
    if (!mounted) return;
    setState(() { busy = false; if (r.ok) { secret = '${r.map['secret']}'; } else { err = errorText(r); } });
  }

  Future<void> _confirm() async {
    if (!RegExp(r'^\d{6}$').hasMatch(code.text.trim())) { setState(() => err = 'Enter the 6-digit code from your authenticator app.'); return; }
    setState(() { busy = true; err = ''; });
    final r = await Api.post('/v1/auth/mfa/confirm', {'code': code.text.trim()});
    if (!mounted) return;
    setState(() {
      busy = false;
      if (r.ok) { codes = (r.map['recoveryCodes'] as List<dynamic>? ?? <dynamic>[]).map((e) => '$e').toList(); secret = null; code.clear(); }
      else { err = errorText(r); }
    });
  }

  Future<void> _verify() async {
    final v = code.text.trim();
    if (!recovery && !RegExp(r'^\d{6}$').hasMatch(v)) { setState(() => err = 'Enter the 6-digit code from your authenticator app.'); return; }
    setState(() { busy = true; err = ''; });
    final r = await Api.post('/v1/auth/mfa/verify', recovery ? {'recoveryCode': v} : {'code': v});
    if (!mounted) return;
    if (r.ok) { await widget.onDone(); return; }
    setState(() { busy = false; err = errorText(r); });
  }

  @override
  Widget build(BuildContext context) {
    if (codes != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Save your recovery codes')),
        body: ListView(padding: const EdgeInsets.all(24), children: [
          const Text('Each code works once if you lose your authenticator. They are shown only now. Store them in a password manager.'),
          const SizedBox(height: 12),
          for (final c in codes!) SelectableText(c, style: const TextStyle(fontFamily: 'monospace', fontSize: 18)),
          CheckboxListTile(value: saved, onChanged: (v) => setState(() => saved = v ?? false), title: const Text('I have saved these codes')),
          FilledButton(onPressed: saved ? () => widget.onDone() : null, child: const Text('Continue')),
        ]),
      );
    }
    return Scaffold(
      appBar: AppBar(title: Text(enrolling ? 'Set up two-step verification' : 'Two-step verification')),
      body: ListView(padding: const EdgeInsets.all(24), children: [
        if (err.isNotEmpty) Banner2(err),
        if (enrolling) ...[
          const Text('Add this account to an authenticator app by entering this key manually (time-based, 6 digits, 30 s):'),
          const SizedBox(height: 8),
          if (secret == null) const LinearProgressIndicator() else SelectableText(secret!, style: const TextStyle(fontFamily: 'monospace', fontSize: 18)),
        ] else
          Text(recovery ? 'Enter one of your recovery codes. It works once.' : 'Enter the 6-digit code from your authenticator app.'),
        const SizedBox(height: 12),
        TextField(controller: code, keyboardType: recovery ? TextInputType.text : TextInputType.number, decoration: InputDecoration(labelText: recovery ? 'Recovery code' : '6-digit code', border: const OutlineInputBorder())),
        const SizedBox(height: 12),
        FilledButton(onPressed: busy || (enrolling && secret == null) ? null : (enrolling ? _confirm : _verify), child: Text(busy ? 'Checking' : (enrolling ? 'Confirm and enable' : 'Verify'))),
        if (!enrolling) TextButton(onPressed: () => setState(() { recovery = !recovery; code.clear(); err = ''; }), child: Text(recovery ? 'Use authenticator code' : 'Use a recovery code')),
        if (!enrolling) TextButton(onPressed: () { setState(() => enrolling = true); _setup(); }, child: const Text('Not set up yet?')),
        TextButton(onPressed: widget.onSignOut, child: const Text('Sign out')),
      ]),
    );
  }
}
