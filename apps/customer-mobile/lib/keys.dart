import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'core.dart';

/// One project: its API keys (create test or live, revoke). A new key is shown once.
class ProjectPage extends StatefulWidget {
  final Map<String, dynamic> project;
  const ProjectPage({super.key, required this.project});
  @override
  State<ProjectPage> createState() => _ProjectPageState();
}

class _ProjectPageState extends State<ProjectPage> {
  List<dynamic>? keys;
  String err = '';
  String fresh = '';
  bool busy = false;

  String get _base => '/v1/console/projects/${widget.project['id']}/keys';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final r = await Api.get(_base);
    if (!mounted) return;
    setState(() { if (r.ok) { keys = r.list; } else { keys = []; err = errorText(r); } });
  }

  Future<void> _create(String mode) async {
    setState(() { busy = true; err = ''; });
    final r = await Api.post(_base, {'mode': mode});
    if (!mounted) return;
    setState(() { busy = false; if (r.ok) { fresh = '${r.map?['key'] ?? ''}'; } else { err = errorText(r); } });
    if (r.ok) await _load();
  }

  Future<void> _revoke(String id) async {
    final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      title: const Text('Revoke this key?'),
      content: const Text('Apps using it will stop working immediately. This cannot be undone.'),
      actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Revoke'))],
    ));
    if (ok != true) return;
    final r = await Api.call('DELETE', '$_base/$id');
    if (!mounted) return;
    if (!r.ok) setState(() => err = errorText(r));
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('${widget.project['name']}')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          if (err.isNotEmpty) Banner2(err),
          if (fresh.isNotEmpty) Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Copy this key now. It is shown only once.', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            SelectableText(fresh, style: const TextStyle(fontFamily: 'monospace')),
            const SizedBox(height: 8),
            Row(children: [
              FilledButton(onPressed: () async { await Clipboard.setData(ClipboardData(text: fresh)); if (!mounted) return; ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Key copied'))); }, child: const Text('Copy key')),
              const SizedBox(width: 8),
              TextButton(onPressed: () => setState(() => fresh = ''), child: const Text('I saved it')),
            ]),
          ]))),
          Wrap(spacing: 8, runSpacing: 8, children: [
            FilledButton(onPressed: busy ? null : () => _create('test'), child: const Text('Create test key')),
            OutlinedButton(onPressed: busy ? null : () => _create('live'), child: const Text('Create live key')),
          ]),
          const SizedBox(height: 8),
          const Text('Live keys need a verified organization. Contact Support to get verified.'),
          const Divider(height: 32),
          if (keys == null) const LinearProgressIndicator(),
          if (keys != null && keys!.isEmpty) const Text('No keys yet.'),
          for (final k in keys ?? <dynamic>[]) Card(child: ListTile(
            title: Text('${(k as Map<String, dynamic>)['prefix']}...  ${k['mode']}'),
            subtitle: Text(k['revokedAt'] != null ? 'Revoked' : (k['lastUsedAt'] != null ? 'Last used ${'${k['lastUsedAt']}'.split('T').first}' : 'Never used')),
            trailing: k['revokedAt'] == null ? TextButton(onPressed: () => _revoke('${k['id']}'), child: const Text('Revoke')) : null,
          )),
        ]),
      ),
    );
  }
}

/// Recent wallet movements (newest first), with paging.
class TransactionsList extends StatefulWidget {
  const TransactionsList({super.key});
  @override
  State<TransactionsList> createState() => _TransactionsListState();
}

class _TransactionsListState extends State<TransactionsList> {
  final List<dynamic> items = [];
  String? next;
  bool loaded = false, more = false;
  String err = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load({bool append = false}) async {
    setState(() => more = true);
    final q = append && next != null ? '&before=${Uri.encodeQueryComponent(next!)}' : '';
    final r = await Api.get('/v1/console/wallet/transactions?limit=25$q');
    if (!mounted) return;
    setState(() {
      more = false; loaded = true;
      if (r.ok) { if (!append) items.clear(); items.addAll((r.map?['items'] as List<dynamic>?) ?? []); next = r.map?['nextBefore'] as String?; } else { err = errorText(r); }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Transactions', style: Theme.of(context).textTheme.titleMedium),
      if (err.isNotEmpty) Banner2(err),
      if (!loaded) const LinearProgressIndicator(),
      if (loaded && items.isEmpty && err.isEmpty) const Text('No transactions yet.'),
      for (final t in items) ListTile(dense: true, title: Text('${(t as Map<String, dynamic>)['type']}'.replaceAll('_', ' ')), subtitle: Text('${t['memo'] ?? t['bucket']}  ${'${t['createdAt']}'.split('T').first}'), trailing: Text(usd(t['amountUsd']))),
      if (next != null) TextButton(onPressed: more ? null : () => _load(append: true), child: const Text('Load more')),
    ]);
  }
}
