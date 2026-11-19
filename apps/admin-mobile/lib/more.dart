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
  final Widget? header;
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
        if (widget.header != null) widget.header!,
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

class UsersTab extends StatelessWidget {
  final bool isSuper;
  final String myId;
  const UsersTab({super.key, required this.isSuper, required this.myId});
  @override
  Widget build(BuildContext context) => RemoteList(
    path: '/v1/admin/users', intro: 'Accounts. A Super Admin can suspend or reactivate; suspending ends the sessions.', empty: 'No users.',
    item: (ctx, u, reload) {
      final canAct = isSuper && u['role'] != 'super_admin' && u['id'] != myId && (u['status'] == 'active' || u['status'] == 'suspended');
      return Card(child: ListTile(
        title: Text('${u['email']}'),
        subtitle: Text('${u['name']}  -  ${u['role']}  -  ${u['status']}${u['organization'] != null ? '  -  ${u['organization']}' : ''}'),
        trailing: canAct ? TextButton(onPressed: () => _post(ctx, '/v1/admin/users/${u['id']}/status', {'status': u['status'] == 'active' ? 'suspended' : 'active'}, reload), child: Text(u['status'] == 'active' ? 'Suspend' : 'Reactivate')) : null,
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
      Text('${o['owner']}  -  ${o['country']}  -  ${o['status']}  -  risk ${o['riskLevel']}'),
      if (isSuper) Wrap(spacing: 8, children: [
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
    path: '/v1/admin/packages', intro: 'Top-up packages. Only a Super Admin can approve and activate. Create new packages in the web console.', empty: 'No packages yet.',
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
