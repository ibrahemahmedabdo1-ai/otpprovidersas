import 'package:flutter/material.dart';
import 'core.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterState();
}

class _RegisterState extends State<RegisterScreen> {
  final name = TextEditingController();
  final email = TextEditingController();
  final pass = TextEditingController();
  bool busy = false;
  bool done = false;
  String err = '';

  Future<void> submit() async {
    setState(() { busy = true; err = ''; });
    final r = await Api.post('/v1/auth/register', {'email': email.text.trim(), 'password': pass.text, 'name': name.text.trim()});
    if (!mounted) return;
    setState(() { busy = false; if (r.ok) { done = true; } else { err = errorText(r); } });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create your account')),
      body: ListView(padding: const EdgeInsets.all(24), children: [
        if (done) const Banner2('If this address can be registered, we sent a verification link valid for 24 hours. Verify your email, then sign in.', ok: true) else ...[
          const Text('No payment details are requested here. Password: at least 12 characters.'),
          const SizedBox(height: 12),
          if (err.isNotEmpty) Banner2(err),
          TextField(controller: name, decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder())),
          const SizedBox(height: 12),
          TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder())),
          const SizedBox(height: 12),
          TextField(controller: pass, obscureText: true, decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder())),
          const SizedBox(height: 16),
          FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'Creating account' : 'Create account')),
        ],
      ]),
    );
  }
}

class Home extends StatefulWidget {
  final Map<String, dynamic> me;
  final Future<void> Function() signOut;
  const Home({super.key, required this.me, required this.signOut});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  int tab = 0;
  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[const WalletTab(), const ProjectsTab(), AccountTab(me: widget.me, signOut: widget.signOut)];
    return Scaffold(
      appBar: AppBar(title: const Text('OTPProvider')),
      body: Column(children: [
        Container(width: double.infinity, color: Theme.of(context).colorScheme.secondaryContainer, padding: const EdgeInsets.all(8), child: const Text('Sandbox only. Nothing here sends real messages or charges your wallet.', style: TextStyle(fontSize: 12))),
        Expanded(child: pages[tab]),
      ]),
      bottomNavigationBar: NavigationBar(selectedIndex: tab, onDestinationSelected: (i) => setState(() => tab = i), destinations: const [
        NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), label: 'Wallet'),
        NavigationDestination(icon: Icon(Icons.folder_outlined), label: 'Projects'),
        NavigationDestination(icon: Icon(Icons.person_outline), label: 'Account'),
      ]),
    );
  }
}

class WalletTab extends StatefulWidget {
  const WalletTab({super.key});
  @override
  State<WalletTab> createState() => _WalletState();
}

class _WalletState extends State<WalletTab> {
  Map<String, dynamic>? w;
  List<dynamic> deps = [];
  String err = '';
  String ok = '';
  final amount = TextEditingController();
  bool busy = false;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final a = await Api.get('/v1/console/wallet');
    final b = await Api.get('/v1/console/wallet/deposits');
    if (!mounted) return;
    setState(() { if (a.ok) { w = a.map; } else { err = errorText(a); } if (b.ok) deps = b.list; });
  }

  Future<void> _request() async {
    final v = amount.text.trim();
    if (!RegExp(r'^\d{1,7}(\.\d{1,2})?$').hasMatch(v) || double.tryParse(v) == 0) { setState(() { err = 'Enter a positive amount in USD with at most 2 decimals.'; ok = ''; }); return; }
    setState(() { busy = true; err = ''; ok = ''; });
    final r = await Api.post('/v1/console/wallet/deposits', {'amountUsd': v});
    if (!mounted) return;
    setState(() { busy = false; if (r.ok) { ok = 'Top-up request recorded. Your balance has not changed. Contact Support for payment instructions; it is credited only after an administrator verifies the funds.'; amount.clear(); } else { err = errorText(r); } });
    if (r.ok) await _load();
  }

  String _bal(String k) => usd((w?[k] as Map<String, dynamic>?)?['usd'] ?? '0');

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        if (err.isNotEmpty) Banner2(err),
        if (ok.isNotEmpty) Banner2(ok, ok: true),
        if (w == null && err.isEmpty) const LinearProgressIndicator(),
        if (w != null) ...[
          Text('Available', style: Theme.of(context).textTheme.labelLarge),
          Text(_bal('available'), style: Theme.of(context).textTheme.displaySmall),
          const SizedBox(height: 8),
          Wrap(spacing: 16, runSpacing: 4, children: [
            Text('Paid ${_bal('paid')}'), Text('Promotional ${_bal('promotional')}'), Text('Reserved ${_bal('reserved')}'), Text('Pending ${_bal('pending')}'),
          ]),
        ],
        const Divider(height: 32),
        Text('Request a top-up', style: Theme.of(context).textTheme.titleMedium),
        const Text('A request does not charge you or add funds. Only an administrator can credit your wallet after verifying the payment.'),
        const SizedBox(height: 8),
        TextField(controller: amount, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Amount (USD)', border: OutlineInputBorder())),
        const SizedBox(height: 8),
        FilledButton(onPressed: busy ? null : _request, child: Text(busy ? 'Sending' : 'Request top-up')),
        const Divider(height: 32),
        Text('Top-up requests', style: Theme.of(context).textTheme.titleMedium),
        if (deps.isEmpty) const Text('No top-up requests yet.'),
        for (final d in deps) ListTile(dense: true, title: Text(usd((d as Map<String, dynamic>)['amountUsd'])), subtitle: Text('${d['status']}'.replaceAll('_', ' '))),
      ]),
    );
  }
}

class ProjectsTab extends StatefulWidget {
  const ProjectsTab({super.key});
  @override
  State<ProjectsTab> createState() => _ProjectsState();
}

class _ProjectsState extends State<ProjectsTab> {
  List<dynamic>? items;
  String err = '';
  final name = TextEditingController();
  bool busy = false;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final r = await Api.get('/v1/console/projects');
    if (!mounted) return;
    setState(() { if (r.ok) { items = r.list; } else { items = []; err = errorText(r); } });
  }

  Future<void> _create() async {
    setState(() { busy = true; err = ''; });
    final r = await Api.post('/v1/console/projects', {'name': name.text.trim()});
    if (!mounted) return;
    setState(() { busy = false; if (r.ok) { name.clear(); } else { err = errorText(r); } });
    if (r.ok) await _load();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        if (err.isNotEmpty) Banner2(err),
        TextField(controller: name, decoration: const InputDecoration(labelText: 'New project name', border: OutlineInputBorder())),
        const SizedBox(height: 8),
        FilledButton(onPressed: busy ? null : _create, child: Text(busy ? 'Creating' : 'Create project')),
        const Divider(height: 32),
        if (items == null) const LinearProgressIndicator(),
        if (items != null && items!.isEmpty) const Text('No projects yet. Create one, then create a test API key on the website console.'),
        for (final p in items ?? <dynamic>[]) ListTile(title: Text('${(p as Map<String, dynamic>)['name']}'), subtitle: Text('${p['activeKeys']} active keys')),
      ]),
    );
  }
}

class AccountTab extends StatelessWidget {
  final Map<String, dynamic> me;
  final Future<void> Function() signOut;
  const AccountTab({super.key, required this.me, required this.signOut});
  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      ListTile(title: const Text('Email'), subtitle: Text('${me['email']}')),
      ListTile(title: const Text('Name'), subtitle: Text('${me['name']}')),
      const SizedBox(height: 16),
      FilledButton(onPressed: signOut, child: const Text('Sign out')),
    ]);
  }
}
