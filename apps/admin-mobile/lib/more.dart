import 'package:flutter/material.dart';
import 'core.dart';

String _usd6(dynamic micro) {
  final n = (num.tryParse('$micro') ?? 0) / 1000000;
  return '\$${n.toStringAsFixed(n >= 1 ? 2 : 4)}';
}

/// Loads a JSON list from [path] and draws one card per row. [item] may call [reload] after an action.
class RemoteList extends StatefulWidget {
  final String path;
  final String intro;
  final String empty;
  final Widget Function(BuildContext, Map<String, dynamic>, Future<void> Function()) item;
  final Widget Function(BuildContext, Future<void> Function())? header;
  const RemoteList({super.key, required this.path, required this.intro, required this.empty, required this.item, this.header});
  @override
  State<RemoteList> createState() => _RemoteListState();
}

class _RemoteListState extends State<RemoteList> {
  List<dynamic>? rows;
  String err = '';

  @override
  void initState() { super.initState(); _load(); }

  @override
  void didUpdateWidget(RemoteList old) { super.didUpdateWidget(old); if (old.path != widget.path) { rows = null; _load(); } }

  Future<void> _load() async {
    final r = await Api.get(widget.path);
    if (!mounted) return;
    setState(() { if (r.ok) { rows = r.list; err = ''; } else { rows = []; err = errorText(r); } });
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        if (widget.intro.isNotEmpty) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(widget.intro)),
        if (widget.header != null) widget.header!(context, _load),
        if (err.isNotEmpty) Banner2(err),
        if (rows == null) const LinearProgressIndicator(),
        if (rows != null && rows!.isEmpty && err.isEmpty) Text(widget.empty),
        for (final r in rows ?? <dynamic>[]) widget.item(context, r as Map<String, dynamic>, _load),
      ]),
    );
  }
}

Future<void> _post(BuildContext context, String path, Map<String, dynamic> body, Future<void> Function() reload) async {
  final r = await Api.post(path, body);
  if (!context.mounted) return;
  if (!r.ok) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(r))));
  await reload();
}

Future<void> _sendReset(BuildContext context, Map<String, dynamic> u) async {
  final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
    title: const Text('Send reset link'),
    content: Text('Email a one-time password reset link (valid 1 hour) to ${u['email']}?'),
    actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')), TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Send'))],
  ));
  if (ok != true || !context.mounted) return;
  final r = await Api.post('/v1/auth/customers/${u['id']}/password-reset', {});
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(r.ok ? 'Reset link sent to ${u['email']}.' : errorText(r))));
}

class UsersTab extends StatelessWidget {
  final bool isSuper;
  final String myId;
  const UsersTab({super.key, required this.isSuper, required this.myId});
  @override
  Widget build(BuildContext context) => RemoteList(
    path: '/v1/admin/users', intro: 'Accounts. Send a customer a one-time reset link; a Super Admin can suspend or reactivate.', empty: 'No users.',
    item: (ctx, u, reload) {
      final canAct = isSuper && u['role'] != 'super_admin' && u['id'] != myId && (u['status'] == 'active' || u['status'] == 'suspended');
      return Card(child: ListTile(
        title: Text('${u['email']}'),
        subtitle: Text('${u['name']}  -  ${u['role']}  -  ${u['status']}${u['organization'] != null ? '  -  ${u['organization']}' : ''}'),
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          if (u['role'] == 'customer' && u['status'] == 'active') TextButton(onPressed: () => _sendReset(ctx, u), child: const Text('Reset link')),
          if (canAct) TextButton(onPressed: () => _post(ctx, '/v1/admin/users/${u['id']}/status', {'status': u['status'] == 'active' ? 'suspended' : 'active'}, reload), child: Text(u['status'] == 'active' ? 'Suspend' : 'Reactivate')),
        ]),
      ));
    },
  );
}

class OrgsTab extends StatelessWidget {
  final bool isSuper;
  const OrgsTab({super.key, required this.isSuper});
  @override
  Widget build(BuildContext context) => RemoteList(
    path: '/v1/admin/organizations', intro: 'Organizations. A Super Admin can suspend an organization or change its risk level.', empty: 'No organizations.',
    item: (ctx, o, reload) => Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('${o['name']}', style: const TextStyle(fontWeight: FontWeight.w700)),
      Text('${o['owner']}  -  ${o['country']}  -  ${o['status']}  -  risk ${o['riskLevel']}  -  verification ${o['verification']}'),
      if (isSuper) Wrap(spacing: 8, children: [
        TextButton(onPressed: () => _post(ctx, '/v1/admin/organizations/${o['id']}/verification', {'status': o['verification'] == 'approved' ? 'rejected' : 'approved'}, reload), child: Text(o['verification'] == 'approved' ? 'Revoke verification' : 'Verify')),
        TextButton(onPressed: () async { final n = await _ask(ctx, 'Rename organization', '${o['name']}'); if (n != null && n.trim().length >= 2 && ctx.mounted) await _post(ctx, '/v1/admin/organizations/${o['id']}/update', {'name': n.trim()}, reload); }, child: const Text('Rename')),
        TextButton(onPressed: () => _post(ctx, '/v1/admin/organizations/${o['id']}/update', {'status': o['status'] == 'active' ? 'suspended' : 'active'}, reload), child: Text(o['status'] == 'active' ? 'Suspend' : 'Reactivate')),
        for (final r in const ['low', 'normal', 'elevated', 'high']) if (r != o['riskLevel']) TextButton(onPressed: () => _post(ctx, '/v1/admin/organizations/${o['id']}/update', {'riskLevel': r}, reload), child: Text('Risk: $r')),
      ]),
    ]))),
  );
}

class PackagesTab extends StatelessWidget {
  final bool isSuper;
  const PackagesTab({super.key, required this.isSuper});
  @override
  Widget build(BuildContext context) => RemoteList(
    path: '/v1/admin/packages', intro: 'Top-up packages. New packages start inactive. Only a Super Admin can approve and activate.', empty: 'No packages yet.',
    header: (ctx, reload) => _PackageForm(onSaved: reload),
    item: (ctx, p, reload) => Card(child: ListTile(
      title: Text('${p['name']}'),
      subtitle: Text('Price ${_usd6(p['priceMicroUsd'])}  -  credit ${_usd6(p['creditMicroUsd'])}  -  ${p['active'] == true ? 'active' : 'inactive'}'),
      trailing: isSuper ? TextButton(onPressed: () => _post(ctx, '/v1/admin/packages/${p['id']}/set', {'active': p['active'] != true}, reload), child: Text(p['active'] == true ? 'Deactivate' : 'Activate')) : null,
    )),
  );
}

class TicketsTab extends StatelessWidget {
  const TicketsTab({super.key});
  @override
  Widget build(BuildContext context) => RemoteList(
    path: '/v1/admin/tickets', intro: 'Read-only oversight of all support tickets.', empty: 'No tickets yet.',
    item: (ctx, t, reload) => Card(child: ListTile(
      title: Text('${t['subject']}'),
      subtitle: Text('${t['organization']}  -  ${'${t['status']}'.replaceAll('_', ' ')}  -  ${t['priority']}  -  ${t['assignee'] ?? 'Unassigned'}'),
    )),
  );
}

class WebhooksTab extends StatelessWidget {
  const WebhooksTab({super.key});
  @override
  Widget build(BuildContext context) => RemoteList(
    path: '/v1/admin/webhook-deliveries', intro: 'Latest 100 webhook deliveries. Payloads and secrets are never shown.', empty: 'No deliveries yet.',
    item: (ctx, d, reload) => Card(child: ListTile(
      title: Text('${d['event']}  ->  ${d['host']}'),
      subtitle: Text('${d['status']}  -  attempts ${d['attempts']}${d['code'] != null ? '  -  HTTP ${d['code']}' : ''}${d['error'] != null ? '\n${d['error']}' : ''}'),
    )),
  );
}

class AuditTab extends StatelessWidget {
  const AuditTab({super.key});
  @override
  Widget build(BuildContext context) => RemoteList(
    path: '/v1/admin/audit', intro: 'Append-only record of the latest 100 staff actions.', empty: 'No audit events.',
    item: (ctx, e, reload) => Card(child: ListTile(
      title: Text('${e['action']}'),
      subtitle: Text('${e['actor'] ?? 'system'}  -  ${e['subjectType'] ?? ''} ${e['subjectId'] ?? ''}\n${e['createdAt']}'),
    )),
  );
}

class ReconciliationTab extends StatefulWidget {
  const ReconciliationTab({super.key});
  @override
  State<ReconciliationTab> createState() => _ReconState();
}

class _ReconState extends State<ReconciliationTab> {
  Map<String, dynamic>? d;
  String err = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { d = null; err = ''; });
    final r = await Api.get('/v1/admin/reconciliation');
    if (!mounted) return;
    setState(() { if (r.ok) { d = r.map; } else { err = errorText(r); } });
  }

  @override
  Widget build(BuildContext context) {
    final mism = (d?['mismatches'] as List<dynamic>?) ?? <dynamic>[];
    return RefreshIndicator(onRefresh: _load, child: ListView(padding: const EdgeInsets.all(16), children: [
      const Text('Checks that every wallet balance equals the sum of its ledger entries. Read-only.'),
      const SizedBox(height: 12),
      if (err.isNotEmpty) Banner2(err),
      if (d == null && err.isEmpty) const LinearProgressIndicator(),
      if (d != null && mism.isEmpty) Banner2('All ${d!['checkedWallets']} wallet(s) agree with the ledger.', ok: true),
      if (d != null && mism.isNotEmpty) Banner2('${mism.length} wallet bucket(s) differ from the ledger. Do not edit balances by hand.'),
      for (final m in mism) Card(child: ListTile(title: Text('${m['bucket']}'), subtitle: Text('Wallet ${m['walletMicroUsd']}  -  ledger ${m['ledgerMicroUsd']}'))),
      OutlinedButton(onPressed: _load, child: const Text('Run again')),
    ]));
  }
}

class CompanyTab extends StatefulWidget {
  final bool isSuper;
  const CompanyTab({super.key, required this.isSuper});
  @override
  State<CompanyTab> createState() => _CompanyState();
}

class _CompanyState extends State<CompanyTab> {
  final names = TextEditingController(), address = TextEditingController(), email = TextEditingController(), phone = TextEditingController();
  bool loaded = false;
  String err = '', ok = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final r = await Api.get('/v1/admin/company');
    if (!mounted) return;
    setState(() {
      if (r.ok) { names.text = '${r.map['legalName'] ?? ''}'; address.text = '${r.map['address'] ?? ''}'; email.text = '${r.map['email'] ?? ''}'; phone.text = '${r.map['phone'] ?? ''}'; } else { err = errorText(r); }
      loaded = true;
    });
  }

  Future<void> _save() async {
    final r = await Api.post('/v1/admin/company', {'legalName': names.text, 'address': address.text, 'email': email.text, 'phone': phone.text});
    if (!mounted) return;
    setState(() { if (r.ok) { ok = 'Saved. The website footer updates within a few minutes.'; err = ''; } else { err = errorText(r); ok = ''; } });
  }

  @override
  Widget build(BuildContext context) {
    final en = widget.isSuper;
    return ListView(padding: const EdgeInsets.all(16), children: [
      const Text('Shown in the public website footer. Leave a field empty to hide it. Only a Super Admin can change these.'),
      const SizedBox(height: 12),
      if (err.isNotEmpty) Banner2(err),
      if (ok.isNotEmpty) Banner2(ok, ok: true),
      if (!loaded) const LinearProgressIndicator(),
      TextField(controller: names, enabled: en, maxLength: 120, decoration: const InputDecoration(labelText: 'Legal name')),
      TextField(controller: address, enabled: en, maxLength: 400, maxLines: 3, decoration: const InputDecoration(labelText: 'Address')),
      TextField(controller: email, enabled: en, maxLength: 120, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')),
      TextField(controller: phone, enabled: en, maxLength: 40, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone')),
      if (en) FilledButton(onPressed: _save, child: const Text('Save changes')),
    ]);
  }
}


Future<String?> _ask(BuildContext context, String title, String initial) {
  final c = TextEditingController(text: initial);
  return showDialog<String>(context: context, builder: (ctx) => AlertDialog(
    title: Text(title),
    content: TextField(controller: c, autofocus: true, maxLength: 120),
    actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, c.text), child: const Text('Save'))],
  ));
}

class _PackageForm extends StatefulWidget {
  final Future<void> Function() onSaved;
  const _PackageForm({required this.onSaved});
  @override
  State<_PackageForm> createState() => _PackageFormState();
}

class _PackageFormState extends State<_PackageForm> {
  final name = TextEditingController(), price = TextEditingController(), credit = TextEditingController();
  String err = '';

  Future<void> _save() async {
    final p = int.tryParse(price.text.trim()), c = int.tryParse(credit.text.trim());
    if (name.text.trim().length < 2 || p == null || c == null) { setState(() => err = 'Enter a name and whole-dollar price and credit.'); return; }
    final r = await Api.post('/v1/admin/packages', {'name': name.text.trim(), 'priceUsd': p, 'creditUsd': c});
    if (!mounted) return;
    if (r.ok) { name.clear(); price.clear(); credit.clear(); setState(() => err = ''); await widget.onSaved(); } else { setState(() => err = errorText(r)); }
  }

  @override
  Widget build(BuildContext context) => Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    const Text('Add package', style: TextStyle(fontWeight: FontWeight.w700)),
    if (err.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Banner2(err)),
    TextField(controller: name, maxLength: 80, decoration: const InputDecoration(labelText: 'Name')),
    Row(children: [
      Expanded(child: TextField(controller: price, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Price USD'))),
      const SizedBox(width: 12),
      Expanded(child: TextField(controller: credit, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Credit USD'))),
    ]),
    const SizedBox(height: 12),
    FilledButton(onPressed: _save, child: const Text('Add package')),
  ])));
}

class PricingTab extends StatelessWidget {
  final bool isSuper;
  const PricingTab({super.key, required this.isSuper});
  @override
  Widget build(BuildContext context) => RemoteList(
    path: '/v1/admin/prices', intro: 'Per-message prices. New prices wait for Super Admin approval; approving retires the previous active price.', empty: 'No prices yet.',
    header: (ctx, reload) => _PriceForm(onSaved: reload),
    item: (ctx, p, reload) => Card(child: ListTile(
      title: Text('${p['channel']}  ${p['country']}  ${_usd6(p['unitPriceMicroUsd'])}'),
      subtitle: Text('v${p['version']}  -  ${'${p['status']}'.replaceAll('_', ' ')}'),
      trailing: (p['status'] == 'pending_approval' && isSuper) ? FilledButton(onPressed: () => _post(ctx, '/v1/admin/prices/${p['id']}/approve', {}, reload), child: const Text('Approve')) : null,
    )),
  );
}

class _PriceForm extends StatefulWidget {
  final Future<void> Function() onSaved;
  const _PriceForm({required this.onSaved});
  @override
  State<_PriceForm> createState() => _PriceFormState();
}

class _PriceFormState extends State<_PriceForm> {
  String channel = 'email';
  final country = TextEditingController(text: '*'), usd = TextEditingController();
  String err = '';

  Future<void> _save() async {
    final v = double.tryParse(usd.text.trim());
    if (v == null || v < 0) { setState(() => err = 'Enter the price in USD, for example 0.02.'); return; }
    final r = await Api.post('/v1/admin/prices', {'channel': channel, 'country': country.text.trim().isEmpty ? '*' : country.text.trim(), 'unitPriceMicroUsd': (v * 1000000).round()});
    if (!mounted) return;
    if (r.ok) { usd.clear(); setState(() => err = ''); await widget.onSaved(); } else { setState(() => err = errorText(r)); }
  }

  @override
  Widget build(BuildContext context) => Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    const Text('Propose price', style: TextStyle(fontWeight: FontWeight.w700)),
    if (err.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Banner2(err)),
    DropdownButtonFormField<String>(initialValue: channel, decoration: const InputDecoration(labelText: 'Channel'), items: const [DropdownMenuItem(value: 'email', child: Text('Email')), DropdownMenuItem(value: 'whatsapp', child: Text('WhatsApp'))], onChanged: (v) => setState(() => channel = v ?? 'email')),
    Row(children: [
      Expanded(child: TextField(controller: country, maxLength: 2, decoration: const InputDecoration(labelText: 'Country (* = all)'))),
      const SizedBox(width: 12),
      Expanded(child: TextField(controller: usd, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'USD per message'))),
    ]),
    const SizedBox(height: 12),
    FilledButton(onPressed: _save, child: const Text('Propose price')),
  ])));
}


class StaffTab extends StatefulWidget {
  const StaffTab({super.key});
  @override
  State<StaffTab> createState() => _StaffTabState();
}

class _StaffTabState extends State<StaffTab> {
  final email = TextEditingController(), name = TextEditingController(), password = TextEditingController();
  String role = 'support_staff', err = '', ok = '';
  bool busy = false;

  Future<void> _create() async {
    setState(() { busy = true; err = ''; ok = ''; });
    final r = await Api.post('/v1/admin/staff', {'email': email.text.trim(), 'name': name.text.trim(), 'role': role, 'password': password.text});
    if (!mounted) return;
    setState(() {
      busy = false;
      if (r.ok) { ok = 'Account created for ${email.text.trim()}. Share the password privately. They must set up MFA at first sign-in.'; email.clear(); name.clear(); password.clear(); } else { err = errorText(r); }
    });
  }

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(16), children: [
    const Text('Create an Admin or Support account. The new person must enrol MFA at first sign-in.'),
    if (err.isNotEmpty) Banner2(err),
    if (ok.isNotEmpty) Banner2(ok, ok: true),
    const SizedBox(height: 8),
    TextField(controller: email, keyboardType: TextInputType.emailAddress, autocorrect: false, decoration: const InputDecoration(labelText: 'Email')),
    const SizedBox(height: 12),
    TextField(controller: name, maxLength: 80, decoration: const InputDecoration(labelText: 'Display name')),
    DropdownButtonFormField<String>(initialValue: role, decoration: const InputDecoration(labelText: 'Role'), items: const [DropdownMenuItem(value: 'support_staff', child: Text('Support')), DropdownMenuItem(value: 'admin_staff', child: Text('Admin'))], onChanged: (v) => setState(() => role = v ?? 'support_staff')),
    const SizedBox(height: 12),
    TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Initial password (12+ characters)')),
    const SizedBox(height: 16),
    FilledButton(onPressed: busy ? null : _create, child: Text(busy ? 'Creating' : 'Create account')),
  ]);
}
